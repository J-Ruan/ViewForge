import type { Point } from "../types";
import { area, bounds, simplify } from "../geometry/polygon";
export interface Component {
  id: number;
  area: number;
  box: [number, number, number, number];
  border: boolean;
}
export interface Segmentation {
  labels: Int32Array;
  components: Component[];
}
export function binarize(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  threshold = 160,
) {
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) {
    const a = rgba[4 * i + 3] / 255;
    ink[i] =
      (0.299 * rgba[4 * i] +
        0.587 * rgba[4 * i + 1] +
        0.114 * rgba[4 * i + 2]) *
        a +
        255 * (1 - a) <
      threshold
        ? 1
        : 0;
  }
  return ink;
}
export function components(
  mask: Uint8Array,
  w: number,
  h: number,
  value = 1,
): Segmentation {
  const labels = new Int32Array(w * h),
    queue = new Int32Array(w * h),
    result: Component[] = [];
  let id = 0;
  for (let i = 0; i < mask.length; i++)
    if (mask[i] === value && !labels[i]) {
      id++;
      if (id > 20000)
        throw new Error("图纸噪点过多，请使用更清晰的图片或调整阈值。");
      let head = 0,
        tail = 1,
        minX = w,
        minY = h,
        maxX = 0,
        maxY = 0,
        border = false;
      queue[0] = i;
      labels[i] = id;
      while (head < tail) {
        const p = queue[head++],
          x = p % w,
          y = Math.floor(p / w);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        border ||= x === 0 || y === 0 || x === w - 1 || y === h - 1;
        for (const n of [
          x ? p - 1 : -1,
          x < w - 1 ? p + 1 : -1,
          y ? p - w : -1,
          y < h - 1 ? p + w : -1,
        ])
          if (n >= 0 && mask[n] === value && !labels[n]) {
            labels[n] = id;
            queue[tail++] = n;
          }
      }
      result.push({
        id,
        area: tail,
        box: [minX, minY, maxX - minX + 1, maxY - minY + 1],
        border,
      });
    }
  return { labels, components: result };
}
export function boundary(
  labels: Int32Array,
  w: number,
  h: number,
  id: number,
  box: [number, number, number, number],
): Point[][] {
  const edges = new Map<number, number[]>(),
    key = (x: number, y: number) => y * (w + 1) + x;
  const add = (a: number, b: number) => {
    const q = edges.get(a) || [];
    q.push(b);
    edges.set(a, q);
    if (edges.size > 200000)
      throw new Error("边界过于复杂，请使用更清晰的单视图图纸。");
  };
  const [bx, by, bw, bh] = box;
  for (let y = by; y < by + bh; y++)
    for (let x = bx; x < bx + bw; x++)
      if (labels[y * w + x] === id) {
        const i = y * w + x;
        if (!y || labels[i - w] !== id) add(key(x, y), key(x + 1, y));
        if (x === w - 1 || labels[i + 1] !== id)
          add(key(x + 1, y), key(x + 1, y + 1));
        if (y === h - 1 || labels[i + w] !== id)
          add(key(x + 1, y + 1), key(x, y + 1));
        if (!x || labels[i - 1] !== id) add(key(x, y + 1), key(x, y));
      }
  const paths: Point[][] = [];
  while (edges.size) {
    let k = edges.keys().next().value!;
    const start = k,
      p: Point[] = [];
    do {
      p.push([k % (w + 1), Math.floor(k / (w + 1))]);
      const q = edges.get(k);
      if (!q?.length) break;
      const next = q.pop()!;
      if (!q.length) edges.delete(k);
      k = next;
    } while (k !== start && p.length < 200000);
    if (k === start && p.length > 3)
      paths.push(simplify([...p, p[0]], 0.8).slice(0, -1));
  }
  return paths.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
}
export interface Silhouette {
  points: Point[];
  box: [number, number, number, number];
  stroke: number;
  alternatives: Point[][];
  method: "enclosed" | "filled";
  ambiguous: boolean;
}
const median = (a: number[]) =>
  a.sort((a, b) => a - b)[Math.floor(a.length / 2)] || 1;
export function extractSilhouette(
  ink: Uint8Array,
  w: number,
  h: number,
): Silhouette {
  const white = components(ink, w, h, 0),
    minArea = Math.max(60, w * h * 0.001);
  const regions = white.components
    .filter((c) => !c.border && c.area > minArea)
    .sort((a, b) => b.area - a.area)
    .slice(0, 12)
    .map((c) => {
      const paths = boundary(white.labels, w, h, c.id, c.box),
        outer = paths[0];
      const score = c.area / Math.max(1, paths.length * 0.5);
      return { c, points: outer, score };
    })
    .filter((c) => c.points?.length >= 3);
  regions.sort((a, b) => b.score - a.score);
  if (regions.length) {
    const main = regions[0],
      p = main.points,
      weights: number[] = [];
    // Measure ink immediately outside long edges; place extracted boundary on the stroke center.
    for (let i = 0; i < p.length; i++) {
      const a = p[i],
        b = p[(i + 1) % p.length],
        len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 10) continue;
      const nx = (b[1] - a[1]) / len,
        ny = -(b[0] - a[0]) / len;
      for (const t of [0.25, 0.5, 0.75]) {
        let n = 0;
        for (let s = 0.5; s < 20; s++) {
          const x = Math.floor(a[0] + (b[0] - a[0]) * t + nx * s),
            y = Math.floor(a[1] + (b[1] - a[1]) * t + ny * s);
          if (x < 0 || x >= w || y < 0 || y >= h || !ink[y * w + x]) break;
          n++;
        }
        if (n) weights.push(n);
      }
    }
    const stroke = median(weights),
      shift = stroke / 2;
    const shifted = p.map((v, i) => {
      const prev = p[(i + p.length - 1) % p.length],
        next = p[(i + 1) % p.length],
        l1 = Math.hypot(v[0] - prev[0], v[1] - prev[1]),
        l2 = Math.hypot(next[0] - v[0], next[1] - v[1]);
      const n1: Point = [(v[1] - prev[1]) / l1, -(v[0] - prev[0]) / l1],
        n2: Point = [(next[1] - v[1]) / l2, -(next[0] - v[0]) / l2],
        den = 1 + n1[0] * n2[0] + n1[1] * n2[1];
      return Math.abs(den) > 0.2
        ? ([
            v[0] + (shift * (n1[0] + n2[0])) / den,
            v[1] + (shift * (n1[1] + n2[1])) / den,
          ] as Point)
        : v;
    });
    const b = bounds([shifted]);
    return {
      points: shifted,
      box: [...b.min, b.max[0] - b.min[0], b.max[1] - b.min[1]],
      stroke,
      alternatives: regions
        .slice(1)
        .filter((r) => r.c.area > main.c.area * 0.15)
        .map((r) => r.points),
      method: "enclosed",
      ambiguous: !!regions[1] && regions[1].score > main.score * 0.7,
    };
  }
  // A solid-filled silhouette is valid too, but never turn disconnected text glyphs into regions.
  const black = components(ink, w, h),
    c = black.components
      .filter((c) => c.area > w * h * 0.015)
      .sort((a, b) => b.area - a.area)[0];
  if (!c)
    throw new Error(
      "未找到封闭零件区域。请使用清晰单视图；可在高级编辑中补绘未闭合边界。",
    );
  const p = boundary(black.labels, w, h, c.id, c.box)[0];
  return {
    points: p,
    box: c.box,
    stroke: 1,
    alternatives: [],
    method: "filled",
    ambiguous: false,
  };
}
