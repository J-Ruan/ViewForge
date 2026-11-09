import { components, type Component } from "./raster";
export interface NumericLabel {
  text: string;
  value: number;
  box: [number, number, number, number];
  score: number;
  unit?: "mm" | "cm";
}
interface Glyph {
  char: string;
  bits: Uint8Array;
  ratio: number;
  holes: number;
}
const W = 20,
  H = 30;
function normalized(
  sample: (x: number, y: number) => number,
  w: number,
  h: number,
) {
  const bits = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let sy = 0; sy < 2; sy++)
        for (let sx = 0; sx < 2; sx++)
          sum += sample(
            Math.min(w - 1, Math.floor(((x + (sx + 0.5) / 2) * w) / W)),
            Math.min(h - 1, Math.floor(((y + (sy + 0.5) / 2) * h) / H)),
          );
      bits[y * W + x] = sum >= 2 ? 1 : 0;
    }
  return bits;
}
function holes(bits: Uint8Array) {
  return components(bits, W, H, 0).components.filter(
    (c) => !c.border && c.area >= 3,
  ).length;
}
export function createGlyphs(): Glyph[] {
  const canvas = new OffscreenCanvas(96, 96),
    ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const glyphs: Glyph[] = [];
  for (const font of ["Arial", "Times New Roman", "sans-serif", "monospace"])
    for (const weight of ["normal", "bold"])
      for (const char of "0123456789mc") {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 96, 96);
        ctx.fillStyle = "black";
        ctx.font = `${weight} 56px ${font}`;
        ctx.textBaseline = "top";
        ctx.fillText(char, 8, 8);
        const rgba = ctx.getImageData(0, 0, 96, 96).data;
        let minX = 96,
          minY = 96,
          maxX = 0,
          maxY = 0;
        for (let y = 0; y < 96; y++)
          for (let x = 0; x < 96; x++)
            if (rgba[(y * 96 + x) * 4] < 160) {
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            }
        const w = maxX - minX + 1,
          h = maxY - minY + 1,
          bits = normalized(
            (x, y) => (rgba[((y + minY) * 96 + x + minX) * 4] < 160 ? 1 : 0),
            w,
            h,
          );
        glyphs.push({ char, bits, ratio: w / h, holes: holes(bits) });
      }
  return glyphs;
}
function distance(bits: Uint8Array) {
  const d = new Uint8Array(W * H).fill(8);
  for (let i = 0; i < d.length; i++) if (bits[i]) d[i] = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      d[i] = Math.min(d[i], x ? d[i - 1] + 1 : 8, y ? d[i - W] + 1 : 8);
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      d[i] = Math.min(
        d[i],
        x < W - 1 ? d[i + 1] + 1 : 8,
        y < H - 1 ? d[i + W] + 1 : 8,
      );
    }
  return d;
}
export function readNumerals(
  ink: Uint8Array,
  w: number,
  h: number,
  glyphs: Glyph[],
): NumericLabel[] {
  const cc = components(ink, w, h).components.filter(
      (c) => c.area >= 4 && c.box[2] < w * 0.12 && c.box[3] < h * 0.12,
    ),
    labels: NumericLabel[] = [];
  const templates = glyphs.map((g) => ({ ...g, dist: distance(g.bits) }));
  for (const rotate of [false, true]) {
    const chars: {
      c: Component;
      char: string;
      score: number;
      bx: number;
      by: number;
      bw: number;
      bh: number;
    }[] = [];
    for (const c of cc) {
      const [x, y, cw, ch] = c.box,
        bw = rotate ? ch : cw,
        bh = rotate ? cw : ch;
      if (bh < 8 || bh > 120 || bw / bh < 0.12 || bw / bh > 2) continue;
      const bits = normalized(
          (a, b) =>
            rotate
              ? ink[(y + a) * w + x + cw - 1 - b]
              : ink[(y + b) * w + x + a],
          bw,
          bh,
        ),
        dist = distance(bits),
        n = bits.reduce((s, v) => s + v, 0),
        hc = holes(bits),
        scores = new Map<string, number>();
      for (const g of templates) {
        let d = 0,
          ng = 0;
        for (let i = 0; i < bits.length; i++) {
          if (bits[i]) d += g.dist[i];
          if (g.bits[i]) {
            d += dist[i];
            ng++;
          }
        }
        const score =
          1 -
          d / (n + ng) / 4 -
          Math.abs(Math.log(bw / bh / g.ratio)) * 0.13 -
          Math.abs(hc - g.holes) * 0.07;
        scores.set(g.char, Math.max(scores.get(g.char) || 0, score));
      }
      const ranked = [...scores].sort((a, b) => b[1] - a[1]);
      if (ranked[0][1] < 0.78 || ranked[0][1] - ranked[1][1] < 0.015) continue;
      chars.push({
        c,
        char: ranked[0][0],
        score: ranked[0][1],
        bx: rotate ? y : x,
        by: rotate ? w - x - cw : y,
        bw,
        bh,
      });
    }
    chars.sort((a, b) => a.bx - b.bx);
    const used = new Set<number>();
    for (const start of chars) {
      if (used.has(start.c.id) || !/[0-9]/.test(start.char)) continue;
      const group = [start];
      used.add(start.c.id);
      for (const c of chars) {
        const last = group.at(-1)!;
        if (
          used.has(c.c.id) ||
          c.bx < last.bx + last.bw - 1 ||
          c.bx - (last.bx + last.bw) > last.bh * 0.85 ||
          Math.abs(c.by + c.bh / 2 - start.by - start.bh / 2) >
            start.bh * 0.3 ||
          Math.abs(c.bh / start.bh - 1) > 0.45
        )
          continue;
        group.push(c);
        used.add(c.c.id);
      }
      let text = group.map((c) => c.char).join("");
      if (!/^\d{1,5}(?:mm|cm)?$/.test(text)) continue;
      // Decimal dots are small disconnected components located near the numeric baseline.
      for (let i = 0; i < group.length - 1; i++) {
        const a = group[i],
          b = group[i + 1];
        if (!/\d/.test(a.char + b.char)) continue;
        const dot = cc.find((c) => {
          const [x, y, cw, ch] = c.box,
            bx = rotate ? y : x,
            by = rotate ? w - x - cw : y,
            dh = rotate ? cw : ch;
          return (
            dh < a.bh * 0.3 &&
            bx > a.bx + a.bw &&
            bx < b.bx &&
            by > a.by + a.bh * 0.65 &&
            by < a.by + a.bh
          );
        });
        if (dot) {
          text = text.slice(0, i + 1) + "." + text.slice(i + 1);
          break;
        }
      }
      const value = Number.parseFloat(text);
      if (!Number.isFinite(value) || value <= 0) continue;
      const x = Math.min(...group.map((g) => g.c.box[0])),
        y = Math.min(...group.map((g) => g.c.box[1])),
        right = Math.max(...group.map((g) => g.c.box[0] + g.c.box[2])),
        bottom = Math.max(...group.map((g) => g.c.box[1] + g.c.box[3]));
      labels.push({
        text,
        value,
        box: [x, y, right - x, bottom - y],
        score: Math.min(...group.map((c) => c.score)),
        unit: text.endsWith("cm")
          ? "cm"
          : text.endsWith("mm")
            ? "mm"
            : undefined,
      });
    }
  }
  return labels;
}
