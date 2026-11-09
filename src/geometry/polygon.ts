import type { Contour, Drawing, Point } from "../types";
export const area = (p: Point[]) =>
  p.reduce((a, v, i) => {
    const n = p[(i + 1) % p.length];
    return a + v[0] * n[1] - n[0] * v[1];
  }, 0) / 2;
export function bounds(rings: Point[][]) {
  const p = rings.flat();
  if (!p.length) throw new Error("没有有效轮廓，请上传图纸或绘制封闭区域。");
  return {
    min: [
      Math.min(...p.map((p) => p[0])),
      Math.min(...p.map((p) => p[1])),
    ] as Point,
    max: [
      Math.max(...p.map((p) => p[0])),
      Math.max(...p.map((p) => p[1])),
    ] as Point,
  };
}
const cross = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onSegment = (a: Point, b: Point, p: Point) =>
  Math.abs(cross(a, b, p)) < 1e-8 &&
  p[0] >= Math.min(a[0], b[0]) - 1e-8 &&
  p[0] <= Math.max(a[0], b[0]) + 1e-8 &&
  p[1] >= Math.min(a[1], b[1]) - 1e-8 &&
  p[1] <= Math.max(a[1], b[1]) + 1e-8;
export function intersects(a: Point, b: Point, c: Point, d: Point) {
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 &&
      cross(c, d, a) * cross(c, d, b) < 0) ||
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  );
}
export function cleanRing(input: Point[]): Point[] {
  if (input.length > 1500)
    throw new Error("单轮廓超过 1500 个顶点，请先简化图纸。");
  const p = input.filter(
    (v, i) =>
      !i || Math.hypot(v[0] - input[i - 1][0], v[1] - input[i - 1][1]) > 1e-8,
  );
  if (
    p.length > 1 &&
    Math.hypot(p[0][0] - p.at(-1)![0], p[0][1] - p.at(-1)![1]) < 1e-8
  )
    p.pop();
  if (
    p.length < 3 ||
    p.some((v) => v.some((x) => !Number.isFinite(x) || Math.abs(x) > 1e6))
  )
    throw new Error("轮廓至少需要三个有限坐标顶点。");
  for (let i = 0; i < p.length; i++)
    for (let j = i + 1; j < p.length; j++) {
      if (j === i + 1 || (i === 0 && j === p.length - 1)) continue;
      if (intersects(p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length]))
        throw new Error("轮廓自相交或边相触，请修复顶点。");
    }
  if (Math.abs(area(p)) < 1e-8) throw new Error("轮廓面积为零。");
  return p;
}
export function normalizeContours(
  contours: Contour[],
  flipY = false,
): Contour[] {
  if (!contours.length) return [];
  const b = bounds(contours.map((c) => c.points)),
    w = b.max[0] - b.min[0],
    h = b.max[1] - b.min[1];
  if (w <= 0 || h <= 0) throw new Error("图纸没有二维面积。");
  return contours.map((c) => ({
    ...c,
    points: c.points.map((p) => [
      (p[0] - b.min[0]) / w,
      flipY ? (b.max[1] - p[1]) / h : (p[1] - b.min[1]) / h,
    ]),
  }));
}
export function calibrated(
  d: Drawing,
  unit: "mm" | "cm",
  leftSide = false,
): Point[][] {
  const s = unit === "cm" ? 10 : 1;
  if (
    ![d.width, d.height].every(
      (x) => Number.isFinite(x) && x > 0 && x * s <= 10000,
    ) ||
    d.offset.some((x) => !Number.isFinite(x) || Math.abs(x * s) > 10000)
  )
    throw new Error("尺寸必须大于 0 且不超过 10000 mm，偏移也须在范围内。");
  const regions = d.contours.filter((c) => c.role === "region" && c.selected);
  if (
    !regions.length ||
    regions.length > 64 ||
    regions.reduce((s, c) => s + c.points.length, 0) > 4000
  )
    throw new Error("请选择 1–64 个区域，总顶点数不超过 4000。");
  const rings = regions.map((c) => {
    if (!c.closed) throw new Error("所选轮廓未闭合，请先修复。");
    return cleanRing(
      c.points.map((p) => [
        ((d.mirror !== leftSide ? 1 - p[0] : p[0]) * d.width + d.offset[0]) * s,
        (p[1] * d.height + d.offset[1]) * s,
      ]),
    );
  });
  // Separate loops may nest (holes) but may never cross or touch.
  for (let i = 0; i < rings.length; i++)
    for (let j = i + 1; j < rings.length; j++)
      for (let a = 0; a < rings[i].length; a++)
        for (let b = 0; b < rings[j].length; b++) {
          if (
            intersects(
              rings[i][a],
              rings[i][(a + 1) % rings[i].length],
              rings[j][b],
              rings[j][(b + 1) % rings[j].length],
            )
          )
            throw new Error(
              "多个轮廓相交或接触，请先修复；内孔应完全包含在外轮廓中。",
            );
        }
  return rings;
}
export function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;
  const a = points[0],
    b = points.at(-1)!;
  let index = 0,
    max = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      t = Math.max(
        0,
        Math.min(
          1,
          ((points[i][0] - a[0]) * dx + (points[i][1] - a[1]) * dy) /
            (dx * dx + dy * dy || 1),
        ),
      );
    const d = Math.hypot(
      points[i][0] - a[0] - t * dx,
      points[i][1] - a[1] - t * dy,
    );
    if (d > max) {
      max = d;
      index = i;
    }
  }
  return max > tolerance
    ? [
        ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
        ...simplify(points.slice(index), tolerance),
      ]
    : [a, b];
}
