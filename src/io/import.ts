import DxfParser from "dxf-parser";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import type {
  Contour,
  Point,
  DrawingAnalysis,
  DimensionReading,
} from "../types";

import { contour } from "../examples";
import { recognizeRaster } from "../recognition/client";
import {
  vectorResult,
  vectorDimensions,
  svgNumericLabels,
} from "../recognition/vectors";
export interface Parsed {
  analysis?: DrawingAnalysis;
  width?: number;
  height?: number;
  contours: Contour[];
  warnings: string[];
}
const MAX_FILE = 12 * 1024 * 1024;
export function parseSvg(
  text: string,
  unit: "mm" | "cm" = "mm",
  fallback = { width: 80, height: 60 },
): Parsed {
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
  return vectorResult(
    contours,
    "svg",
    unit,
    fallback,
    vectorDimensions(contours, svgNumericLabels(xml)),
  );
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
export function parseDxf(
  text: string,
  unit: "mm" | "cm" = "mm",
  fallback = { width: 80, height: 60 },
): Parsed {
  // The parser ignores unknown entities; preflight ensures exclusions are surfaced.
  const pairs = text.replace(/\r/g, "").split("\n"),
    unknown = new Set<string>();
  let section = "",
    nextSection = false;
  const supported = new Set([
    "TEXT",
    "MTEXT",
    "DIMENSION",
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
  const dimensions: DimensionReading[] = [];
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
    if (["TEXT", "MTEXT"].includes(e.type)) continue;
    if (e.type === "DIMENSION") {
      const d =
        entity as unknown as import("dxf-parser/dist/entities/dimension").IDimensionEntity;
      const a = d.linearOrAngularPoint1,
        b = d.linearOrAngularPoint2;
      if (!a || !b || !["", "<>"].includes(d.text || ""))
        throw new Error(
          "DXF 尺寸含覆盖文字或不支持的标注，请先核对真实测量值。",
        );
      const baseType = d.dimensionType & 7,
        angle = (((d.angle || 0) % 180) + 180) % 180;
      const horizontal =
          (baseType === 0 && Math.abs(angle) < 1e-6) ||
          (baseType === 1 && Math.abs(a.y - b.y) < 1e-6),
        vertical =
          (baseType === 0 && Math.abs(angle - 90) < 1e-6) ||
          (baseType === 1 && Math.abs(a.x - b.x) < 1e-6);
      if (!horizontal && !vertical)
        throw new Error("当前仅自动读取水平/垂直线性 DXF 尺寸。");
      const pts = horizontal ? [a.x, b.x] : [-a.y, -b.y],
        measurement =
          Number.isFinite(d.actualMeasurement) && d.actualMeasurement > 0
            ? d.actualMeasurement
            : Math.abs(pts[1] - pts[0]);
      dimensions.push({
        id: `native-${dimensions.length}`,
        text: String(measurement),
        value: measurement,
        unit:
          dxf.header?.$INSUNITS === 4
            ? "mm"
            : dxf.header?.$INSUNITS === 5
              ? "cm"
              : undefined,
        axis: horizontal ? "u" : "v",
        start: Math.min(...pts),
        end: Math.max(...pts),
        labelBox: [d.middleOfText?.x || 0, -(d.middleOfText?.y || 0), 0, 0],
        score: 1,
        source: "dxf",
        accepted: true,
      });
      continue;
    }
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
  return vectorResult(contours, "dxf", unit, fallback, dimensions);
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
  options = { unit: "mm" as "mm" | "cm", width: 80, height: 60 },
): Promise<Parsed & { sourceData: string }> {
  if (file.size > MAX_FILE) throw new Error("文件不能超过 12 MB。");
  const ext = file.name.split(".").at(-1)?.toLowerCase();
  if (ext === "svg")
    return {
      ...parseSvg(await file.text(), options.unit, options),
      sourceData: await dataUrl(file),
    };
  if (ext === "dxf")
    return {
      ...parseDxf(await file.text(), options.unit, options),
      sourceData: await file.text(),
    };
  if (!["png", "jpg", "jpeg"].includes(ext || ""))
    throw new Error("仅支持 PNG、JPG、SVG、基础二维 DXF。");
  const sourceData = await dataUrl(file),
    bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 24_000_000)
      throw new Error("图片超过 2400 万像素，请先缩小。");
    const scale = Math.min(1, 1536 / Math.max(bitmap.width, bitmap.height)),
      w = Math.round(bitmap.width * scale),
      h = Math.round(bitmap.height * scale),
      canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, w, h);
    return {
      sourceData,
      ...(await recognizeRaster(
        ctx.getImageData(0, 0, w, h).data,
        w,
        h,
        threshold,
        options.unit,
        options.width,
        options.height,
      )),
      warnings: [],
    };
  } finally {
    bitmap.close();
  }
}
