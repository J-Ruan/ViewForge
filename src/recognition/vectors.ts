import type {
  Contour,
  DimensionReading,
  DrawingAnalysis,
  Point,
} from "../types";
import { area, bounds } from "../geometry/polygon";
import { calibrateAnalysis, associateDimensions } from "./dimensions";
import type { NumericLabel } from "./numerals";
function inside(p: Point, ring: Point[]) {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    if (
      ring[i][1] > p[1] !== ring[j][1] > p[1] &&
      p[0] <
        ((ring[j][0] - ring[i][0]) * (p[1] - ring[i][1])) /
          (ring[j][1] - ring[i][1]) +
          ring[i][0]
    )
      yes = !yes;
  return yes;
}
export function vectorResult(
  contours: Contour[],
  method: "svg" | "dxf",
  unit: "mm" | "cm",
  fallback: { width: number; height: number },
  dimensions: DimensionReading[] = [],
) {
  const closed = contours
    .filter((c) => c.closed && c.role === "region" && c.points.length >= 3)
    .sort((a, b) => Math.abs(area(b.points)) - Math.abs(area(a.points)));
  if (!closed.length)
    return {
      contours,
      warnings: ["未找到封闭矢量区域，请使用高级编辑闭合零件边界。"],
    };
  const main = closed[0],
    screen =
      method === "svg"
        ? main.points
        : main.points.map((p) => [p[0], -p[1]] as Point),
    b = bounds([screen]);
  const alternatives = closed
    .slice(1)
    .filter(
      (c) =>
        !inside(c.points[0], main.points) &&
        Math.abs(area(c.points)) > Math.abs(area(main.points)) * 0.7,
    );
  const analysis: DrawingAnalysis = {
    method,
    status: "needs-size",
    rawOutline: screen,
    objectBox: [...b.min, b.max[0] - b.min[0], b.max[1] - b.min[1]],
    imageSize: [Math.max(1, b.max[0]), Math.max(1, b.max[1])],
    dimensions,
    pixelUncertainty: 0,
    alternatives: alternatives.map((c) =>
      method === "svg" ? c.points : c.points.map((p) => [p[0], -p[1]] as Point),
    ),
    widthSource: "manual",
    heightSource: "manual",
    notes: ["已分离零件外轮廓与外部标注，矢量几何保持原始精度。"],
  };
  const result = calibrateAnalysis(analysis, unit, fallback);
  const inner = closed.slice(1).filter((c) => inside(c.points[0], main.points));
  // Nested vector rings carry explicit fill semantics and remain selected; no hidden raster lines are inferred.
  for (const c of inner) {
    const points = c.points.map(
      (p) => [p[0], method === "svg" ? p[1] : -p[1]] as Point,
    );
    const mapped = calibrateAnalysis(
      { ...analysis, rawOutline: [...screen, ...points] },
      unit,
      fallback,
    ).contours[0].points.slice(screen.length);
    result.contours.push({ ...c, points: mapped, selected: true });
  }
  return { ...result, warnings: [] };
}
export function vectorDimensions(
  contours: Contour[],
  labels: NumericLabel[],
): DimensionReading[] {
  if (!labels.length) return [];
  const b = bounds([
      ...contours.map((c) => c.points),
      labels.flatMap(
        (l) =>
          [
            [l.box[0], l.box[1]],
            [l.box[0] + l.box[2], l.box[1] + l.box[3]],
          ] as Point[],
      ),
    ]),
    scale = Math.min(
      10,
      1400 / Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]),
    ),
    w = Math.ceil((b.max[0] - b.min[0]) * scale) + 12,
    h = Math.ceil((b.max[1] - b.min[1]) * scale) + 12,
    mask = new Uint8Array(w * h);
  const line = (a: Point, z: Point) => {
    const x0 = (a[0] - b.min[0]) * scale + 5,
      y0 = (a[1] - b.min[1]) * scale + 5,
      x1 = (z[0] - b.min[0]) * scale + 5,
      y1 = (z[1] - b.min[1]) * scale + 5,
      n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let t = 0; t <= n; t++) {
      const x = Math.round(x0 + ((x1 - x0) * t) / (n || 1)),
        y = Math.round(y0 + ((y1 - y0) * t) / (n || 1));
      mask[y * w + x] = 1;
    }
  };
  contours.forEach((c) =>
    c.points.forEach((p, i) => {
      if (i < c.points.length - 1 || c.closed)
        line(p, c.points[(i + 1) % c.points.length]);
    }),
  );
  return associateDimensions(
    mask,
    w,
    h,
    labels.map((l) => ({
      ...l,
      box: [
        (l.box[0] - b.min[0]) * scale + 5,
        (l.box[1] - b.min[1]) * scale + 5,
        l.box[2] * scale,
        l.box[3] * scale,
      ],
    })),
  ).map((d) => ({
    ...d,
    source: "vector",
    start: (d.start - 5) / scale + b.min[d.axis === "u" ? 0 : 1],
    end: (d.end - 5) / scale + b.min[d.axis === "u" ? 0 : 1],
    labelBox: [
      (d.labelBox[0] - 5) / scale + b.min[0],
      (d.labelBox[1] - 5) / scale + b.min[1],
      d.labelBox[2] / scale,
      d.labelBox[3] / scale,
    ],
  }));
}
export function svgNumericLabels(xml: Document): NumericLabel[] {
  return Array.from(xml.querySelectorAll("text")).flatMap((el) => {
    const text = el.textContent?.trim() || "";
    if (!/^\d+(?:\.\d+)?\s*(?:mm|cm)?$/.test(text)) return [];
    let matrix = new DOMMatrix();
    const ancestors: Element[] = [];
    for (let p: Element | null = el; p; p = p.parentElement)
      ancestors.unshift(p);
    for (const a of ancestors)
      for (const m of (a.getAttribute("transform") || "").matchAll(
        /(translate|scale|rotate|matrix)\s*\(([^)]*)\)/g,
      )) {
        const n = m[2]
          .trim()
          .split(/[\s,]+/)
          .map(Number);
        const t =
          m[1] === "translate"
            ? new DOMMatrix().translate(n[0], n[1] || 0)
            : m[1] === "scale"
              ? new DOMMatrix().scale(n[0], n[1] ?? n[0])
              : m[1] === "rotate"
                ? new DOMMatrix()
                    .translate(n[1] || 0, n[2] || 0)
                    .rotate(n[0])
                    .translate(-(n[1] || 0), -(n[2] || 0))
                : new DOMMatrix(n);
        matrix = matrix.multiply(t);
      }
    const inherited = (key: string, fallback: string) => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const value =
          node.getAttribute(key) ||
          node
            .getAttribute("style")
            ?.match(new RegExp(`(?:^|;)\\s*${key}\\s*:\\s*([^;]+)`))?.[1];
        if (value) return value;
      }
      return fallback;
    };
    const x = Number(el.getAttribute("x") || 0),
      y = Number(el.getAttribute("y") || 0),
      size = Number.parseFloat(inherited("font-size", "16")),
      canvas = new OffscreenCanvas(1, 1),
      ctx = canvas.getContext("2d")!;
    ctx.font = `${inherited("font-weight", "normal")} ${size}px ${inherited("font-family", "sans-serif")}`;
    const metrics = ctx.measureText(text),
      width = metrics.width,
      anchor = inherited("text-anchor", "start"),
      left =
        x - (anchor === "middle" ? width / 2 : anchor === "end" ? width : 0),
      top = y - metrics.actualBoundingBoxAscent,
      height =
        metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    const corners = [
        [left, top],
        [left + width, top],
        [left + width, top + height],
        [left, top + height],
      ].map((p) =>
        new DOMPoint(...(p as [number, number])).matrixTransform(matrix),
      ),
      minX = Math.min(...corners.map((p) => p.x)),
      minY = Math.min(...corners.map((p) => p.y)),
      maxX = Math.max(...corners.map((p) => p.x)),
      maxY = Math.max(...corners.map((p) => p.y));
    return [
      {
        text,
        value: Number.parseFloat(text),
        box: [minX, minY, maxX - minX, maxY - minY] as [
          number,
          number,
          number,
          number,
        ],
        score: 1,
        unit: text.endsWith("cm")
          ? "cm"
          : text.endsWith("mm")
            ? "mm"
            : undefined,
      },
    ];
  });
}
