import DxfParser from "dxf-parser";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import type { Contour, Point } from "../types";
import { normalizeContours, simplify } from "../geometry/polygon";
import { contour } from "../examples";
export interface Parsed {
  contours: Contour[];
  warnings: string[];
}
const MAX_FILE = 12 * 1024 * 1024;
export function parseSvg(text: string): Parsed {
  if (text.length > MAX_FILE) throw new Error("SVG 文件超过 12 MB。");
  const xml = new DOMParser().parseFromString(text, "image/svg+xml");
  if (
    xml.querySelector("parsererror") ||
    xml.documentElement.localName !== "svg"
  )
    throw new Error("SVG 格式无效。");
  if (
    xml.querySelector("script,foreignObject,image,use,style") ||
    /(?:href\s*=|url\s*\(|<!ENTITY|<!DOCTYPE)/i.test(text)
  )
    throw new Error(
      "为安全起见，SVG 仅支持独立矢量几何，不接受脚本、外部资源、样式表或 use 引用。请先展开路径。",
    );
  const parsed = new SVGLoader().parse(text),
    contours: Contour[] = [];
  let count = 0;
  for (const path of parsed.paths) {
    const style = path.userData?.style;
    if (style?.visibility === "hidden" || style?.display === "none") continue;
    if (
      (style?.fill === "#fff" ||
        style?.fill === "#ffffff" ||
        style?.fill === "white") &&
      (!style.stroke || style.stroke === "none")
    )
      continue;
    for (const sub of path.subPaths) {
      const points = sub.getPoints(24).map((p) => [p.x, p.y] as Point);
      if (points.length < 2) continue;
      count += points.length;
      if (count > 12000) throw new Error("SVG 路径过于复杂，请先简化。");
      const closed =
        sub.autoClose ||
        Math.hypot(
          points[0][0] - points.at(-1)![0],
          points[0][1] - points.at(-1)![1],
        ) < 1e-6;
      if (
        closed &&
        points.length > 2 &&
        points[0][0] === points.at(-1)![0] &&
        points[0][1] === points.at(-1)![1]
      )
        points.pop();
      contours.push({
        ...contour(points, String(contours.length)),
        closed,
        selected: closed,
        role: style?.strokeDasharray?.length ? "reference" : "region",
      });
    }
  }
  if (!contours.length)
    throw new Error(
      "SVG 中没有可用几何。支持 path、polygon、rect、circle、ellipse、line、polyline。",
    );
  return {
    contours: normalizeContours(contours, true),
    warnings: [
      "SVG 曲线已离散为折线。请排除尺寸线和背景区域，并检查内孔与闭合状态。",
    ],
  };
}
function joinPaths(paths: Point[][]): Point[][] {
  const remaining = paths.map((p) => [...p]),
    result: Point[][] = [];
  const near = (a: Point, b: Point) =>
    Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
  while (remaining.length) {
    const p = remaining.shift()!;
    let found = true;
    while (found && !near(p[0], p.at(-1)!)) {
      found = false;
      for (let i = 0; i < remaining.length; i++) {
        const q = remaining[i];
        if (near(p.at(-1)!, q[0]) || near(p.at(-1)!, q.at(-1)!)) {
          if (near(p.at(-1)!, q.at(-1)!)) q.reverse();
          p.push(...q.slice(1));
          remaining.splice(i, 1);
          found = true;
          break;
        }
      }
    }
    result.push(p);
  }
  return result;
}
export function parseDxf(text: string): Parsed {
  // The parser ignores unknown entities; preflight ensures exclusions are surfaced.
  const pairs = text.replace(/\r/g, "").split("\n"),
    unknown = new Set<string>();
  let section = "",
    nextSection = false;
  const supported = new Set([
    "LINE",
    "LWPOLYLINE",
    "POLYLINE",
    "VERTEX",
    "SEQEND",
    "CIRCLE",
    "ARC",
    "ENDSEC",
  ]);
  for (let i = 0; i < pairs.length - 1; i += 2) {
    const c = pairs[i].trim(),
      v = pairs[i + 1].trim();
    if (c === "0" && v === "SECTION") nextSection = true;
    else if (nextSection && c === "2") {
      section = v;
      nextSection = false;
    } else if (section === "ENTITIES" && c === "0" && !supported.has(v))
      unknown.add(v);
    if (v === "ENDSEC" && c === "0") section = "";
  }
  if (unknown.size)
    throw new Error(
      `DXF 含不支持的实体：${[...unknown].join("、")}。请在 CAD 中删除标注、展开块并将样条转换为折线后重试。`,
    );
  const dxf = new DxfParser().parseSync(text);
  if (!dxf) throw new Error("DXF 格式无效。");
  const paths: Point[][] = [],
    refs: Point[][] = [];
  for (const entity of dxf.entities) {
    const e = entity as unknown as {
      type: string;
      vertices?: { x: number; y: number; z?: number; bulge?: number }[];
      shape?: boolean;
      center?: { x: number; y: number; z?: number };
      radius?: number;
      startAngle?: number;
      endAngle?: number;
      lineType?: string;
      elevation?: number;
      extrusionDirectionZ?: number;
    };
    if (
      e.elevation ||
      e.center?.z ||
      e.vertices?.some((v) => v.z) ||
      (e.extrusionDirectionZ !== undefined && e.extrusionDirectionZ !== 1)
    )
      throw new Error(
        "仅支持世界 XY 平面中的基础二维 DXF，请先展平并消除 OCS 变换。",
      );
    let points: Point[] = [];
    if (e.type === "CIRCLE" || e.type === "ARC") {
      const start = e.type === "CIRCLE" ? 0 : e.startAngle!,
        end = e.type === "CIRCLE" ? Math.PI * 2 : e.endAngle!;
      let span = end - start;
      if (span <= 0) span += Math.PI * 2;
      const n = Math.max(8, Math.ceil((span / (Math.PI * 2)) * 96));
      points = Array.from({ length: n + 1 }, (_, i) => [
        e.center!.x + e.radius! * Math.cos(start + (span * i) / n),
        e.center!.y + e.radius! * Math.sin(start + (span * i) / n),
      ]);
    } else if (["LINE", "LWPOLYLINE", "POLYLINE"].includes(e.type)) {
      const vertices = e.vertices || [];
      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i],
          b = vertices[(i + 1) % vertices.length];
        points.push([a.x, a.y]);
        if (a.bulge && (i < vertices.length - 1 || e.shape)) {
          const theta = 4 * Math.atan(a.bulge),
            dx = b.x - a.x,
            dy = b.y - a.y,
            d = Math.hypot(dx, dy),
            h = (d * (1 - a.bulge * a.bulge)) / (4 * a.bulge),
            cx = (a.x + b.x) / 2 - (dy / d) * h,
            cy = (a.y + b.y) / 2 + (dx / d) * h,
            r = Math.hypot(a.x - cx, a.y - cy),
            angle = Math.atan2(a.y - cy, a.x - cx),
            n = Math.max(4, Math.ceil(Math.abs(theta) * 16));
          for (let j = 1; j < n; j++)
            points.push([
              cx + r * Math.cos(angle + (theta * j) / n),
              cy + r * Math.sin(angle + (theta * j) / n),
            ]);
        }
      }
      if (e.shape && points.length) points.push(points[0]);
    } else throw new Error(`不支持的 DXF 实体：${e.type}`);
    if (points.length > 1)
      (e.lineType &&
      !["CONTINUOUS", "BYLAYER", "BYBLOCK"].includes(e.lineType.toUpperCase())
        ? refs
        : paths
      ).push(points);
  }
  const contours = joinPaths(paths).map((p, i) => {
    const closed =
      Math.hypot(p[0][0] - p.at(-1)![0], p[0][1] - p.at(-1)![1]) < 1e-6;
    if (closed) p.pop();
    return { ...contour(p, String(i)), closed, selected: closed };
  });
  refs.forEach((p, i) =>
    contours.push({
      ...contour(p, `ref-${i}`),
      closed: false,
      selected: false,
      role: "reference",
    }),
  );
  if (!contours.length) throw new Error("DXF 中没有可用二维几何。");
  return {
    contours: normalizeContours(contours),
    warnings: [
      "DXF 保留原始矢量并离散圆弧；虚线标为参考线。请手动校准实际尺寸（不自动采用 $INSUNITS）。",
    ],
  };
}
export function traceRaster(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  threshold = 160,
): Contour[] {
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) {
    const a = rgba[i * 4 + 3] / 255,
      gray =
        (0.299 * rgba[i * 4] +
          0.587 * rgba[i * 4 + 1] +
          0.114 * rgba[i * 4 + 2]) *
          a +
        255 * (1 - a);
    mask[i] = gray < threshold ? 1 : 0;
  }
  const clean = mask.slice();
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (
        mask[i] &&
        !mask[i - 1] &&
        !mask[i + 1] &&
        !mask[i - w] &&
        !mask[i + w]
      )
        clean[i] = 0;
    }
  const edges = new Map<number, number[]>();
  let count = 0;
  const edge = (a: number, b: number) => {
    const q = edges.get(a) || [];
    q.push(b);
    edges.set(a, q);
    if (++count > 200000)
      throw new Error("图片线条过多，请裁剪到单个视图并移除标注。");
  };
  const idx = (x: number, y: number) => y * (w + 1) + x;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (clean[y * w + x]) {
        if (y === 0 || !clean[(y - 1) * w + x]) edge(idx(x, y), idx(x + 1, y));
        if (x === w - 1 || !clean[y * w + x + 1])
          edge(idx(x + 1, y), idx(x + 1, y + 1));
        if (y === h - 1 || !clean[(y + 1) * w + x])
          edge(idx(x + 1, y + 1), idx(x, y + 1));
        if (x === 0 || !clean[y * w + x - 1]) edge(idx(x, y + 1), idx(x, y));
      }
  const loops: Point[][] = [];
  while (edges.size) {
    const start = edges.keys().next().value!;
    let key = start;
    const p: Point[] = [];
    let closed = false;
    for (let n = 0; n <= count; n++) {
      p.push([key % (w + 1), Math.floor(key / (w + 1))]);
      const list = edges.get(key);
      if (!list?.length) break;
      const next = list.pop()!;
      if (!list.length) edges.delete(key);
      key = next;
      if (key === start) {
        closed = true;
        break;
      }
    }
    const area =
      p.reduce(
        (a, v, i) =>
          a + v[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * v[1],
        0,
      ) / 2;
    // Keep only outer boundaries of ink components; do not mistake stroke interiors for holes.
    if (closed && area > 16) loops.push(simplify([...p, p[0]], 1).slice(0, -1));
  }
  loops.sort((a, b) => b.length - a.length);
  if (!loops.length)
    throw new Error("未找到可靠轮廓。请提高对比度、调整阈值或手动描绘。");
  return normalizeContours(
    loops
      .slice(0, 64)
      .map((p, i) => ({ ...contour(p, String(i)), selected: false })),
    true,
  );
}
const dataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("读取文件失败。"));
    r.readAsDataURL(file);
  });
export async function importDrawing(
  file: File,
  threshold = 160,
): Promise<Parsed & { sourceData: string }> {
  if (file.size > MAX_FILE) throw new Error("文件不能超过 12 MB。");
  const ext = file.name.split(".").at(-1)?.toLowerCase();
  if (ext === "svg")
    return { ...parseSvg(await file.text()), sourceData: await dataUrl(file) };
  if (ext === "dxf")
    return { ...parseDxf(await file.text()), sourceData: await file.text() };
  if (!["png", "jpg", "jpeg"].includes(ext || ""))
    throw new Error("仅支持 PNG、JPG、SVG、基础二维 DXF。");
  const sourceData = await dataUrl(file),
    bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 24_000_000)
      throw new Error("图片超过 2400 万像素，请先缩小。");
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height)),
      w = Math.round(bitmap.width * scale),
      h = Math.round(bitmap.height * scale),
      canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, w, h);
    return {
      sourceData,
      contours: traceRaster(ctx.getImageData(0, 0, w, h).data, w, h, threshold),
      warnings: [
        "已执行灰度化、阈值分割、孤立噪点清理、边界追踪与折线简化。图片中的线条语义无法可靠推断，请手动勾选实体区域；内孔必须显式选择或补画。",
      ],
    };
  } finally {
    bitmap.close();
  }
}
