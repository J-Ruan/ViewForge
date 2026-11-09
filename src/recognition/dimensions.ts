import type {
  DimensionReading,
  DrawingAnalysis,
  Point,
  Contour,
} from "../types";
import type { NumericLabel } from "./numerals";
import { bounds } from "../geometry/polygon";
// Detect the actual dimension line and its perpendicular extension lines, not just nearby digits.
export function associateDimensions(
  ink: Uint8Array,
  w: number,
  h: number,
  labels: NumericLabel[],
): DimensionReading[] {
  const output: DimensionReading[] = [];
  for (const label of labels) {
    const [x, y, lw, lh] = label.box;
    let best:
      | { axis: "u" | "v"; start: number; end: number; cost: number }
      | undefined;
    for (const axis of ["u", "v"] as const) {
      const across = axis === "u" ? w : h,
        along = axis === "u" ? h : w,
        center = axis === "u" ? x + lw / 2 : y + lh / 2,
        lo = axis === "u" ? y : x,
        hi = axis === "u" ? y + lh : x + lw,
        size = Math.max(lw, lh),
        get = (u: number, v: number) =>
          axis === "u" ? ink[v * w + u] : ink[u * w + v];
      for (
        let row = Math.max(0, Math.floor(lo - size * 1.4));
        row < Math.min(along, Math.ceil(hi + size * 1.4));
        row++
      ) {
        if (row >= lo - 1 && row <= hi + 1) continue;
        const col = Math.round(center);
        if (col < 0 || col >= across || !get(col, row)) continue;
        let start = col,
          end = col;
        while (start > 0 && get(start - 1, row)) start--;
        while (end < across - 1 && get(end + 1, row)) end++;
        if (end - start < Math.max(18, (axis === "u" ? lw : lh) * 1.6))
          continue;
        const anchors: number[] = [];
        for (let c = start; c <= end; c++) {
          let count = 0,
            total = 0;
          const r1 = Math.max(0, Math.round(row - size * 0.35)),
            r2 = Math.min(along - 1, Math.round(row + size * 0.35));
          for (let r = r1; r <= r2; r++) {
            total++;
            count += get(c, r);
          }
          if (count / total > 0.8) anchors.push(c);
        }
        const centers: number[] = [];
        for (let i = 0; i < anchors.length; ) {
          let j = i;
          while (j + 1 < anchors.length && anchors[j + 1] - anchors[j] <= 2)
            j++;
          centers.push((anchors[i] + anchors[j]) / 2);
          i = j + 1;
        }
        const left = centers.filter((a) => a < center - size * 0.12).at(-1),
          right = centers.find((a) => a > center + size * 0.12);
        if (
          left === undefined ||
          right === undefined ||
          right - left < size * 0.8
        )
          continue;
        const cost =
          Math.min(Math.abs(row - lo), Math.abs(row - hi)) / size +
          (Math.abs(center - (left + right) / 2) / (right - left)) * 0.5;
        if (!best || cost < best.cost)
          best = { axis, start: left, end: right, cost };
      }
    }
    if (best) {
      const duplicate = output.find(
        (d) =>
          d.axis === best.axis &&
          Math.abs(d.start - best.start) < 3 &&
          Math.abs(d.end - best.end) < 3 &&
          Math.hypot(d.labelBox[0] - x, d.labelBox[1] - y) < 10,
      );
      if (!duplicate)
        output.push({
          id: `dim-${output.length}`,
          text: label.text,
          value: label.value,
          axis: best.axis,
          start: best.start,
          end: best.end,
          labelBox: label.box,
          score: label.score,
          unit: label.unit,
          source: "template",
          accepted: label.score >= 0.9,
        });
    }
  }
  return output;
}
const median = (a: number[]) =>
  [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
interface Mapping {
  map: (v: number) => number;
  scale: number;
  source: "dimension" | "scale" | "manual";
  conflict: boolean;
  known: boolean;
}
function axisMapping(
  readings: DimensionReading[],
  axis: "u" | "v",
  unit: "mm" | "cm",
  low: number,
  high: number,
  snap: number,
): Mapping {
  const ds = readings.filter(
      (d) => d.axis === axis && d.accepted && d.value > 0 && d.end > d.start,
    ),
    scales = ds.map(
      (d) =>
        (d.value *
          (d.unit && d.unit !== unit ? (d.unit === "cm" ? 10 : 0.1) : 1)) /
        (d.end - d.start),
    );
  if (!ds.length)
    return {
      map: (v) => v - low,
      scale: 1,
      source: "manual",
      conflict: false,
      known: false,
    };
  const scale = median(scales),
    consistent = ds.filter((_, i) => Math.abs(scales[i] / scale - 1) < 0.04),
    conflict = consistent.length !== ds.length;
  // Reject inconsistent chains as a group. Do not silently trust one OCR reading over another.
  if (conflict)
    return {
      map: (v) => (v - low) * scale,
      scale,
      source: "manual",
      conflict: true,
      known: false,
    };
  const anchors: number[] = [];
  for (const v of consistent
    .flatMap((d) => [d.start, d.end])
    .sort((a, b) => a - b)) {
    const near = anchors.findIndex((a) => Math.abs(a - v) <= snap);
    if (near < 0) anchors.push(v);
    else anchors[near] = (anchors[near] + v) / 2;
  }
  const n = anchors.length,
    normal = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  const idx = (v: number) =>
    anchors.reduce(
      (best, a, i) =>
        Math.abs(a - v) < Math.abs(anchors[best] - v) ? i : best,
      0,
    );
  for (const d of consistent) {
    const a = idx(d.start),
      b = idx(d.end),
      val =
        d.value *
        (d.unit && d.unit !== unit ? (d.unit === "cm" ? 10 : 0.1) : 1);
    normal[a][a]++;
    normal[b][b]++;
    normal[a][b]--;
    normal[b][a]--;
    normal[a][n] -= val;
    normal[b][n] += val;
  }
  normal[0][0]++;
  let solved = true;
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let j = i + 1; j < n; j++)
      if (Math.abs(normal[j][i]) > Math.abs(normal[pivot][i])) pivot = j;
    [normal[i], normal[pivot]] = [normal[pivot], normal[i]];
    const d = normal[i][i];
    if (Math.abs(d) < 1e-8) {
      solved = false;
      break;
    }
    for (let c = i; c <= n; c++) normal[i][c] /= d;
    for (let r = 0; r < n; r++)
      if (r !== i) {
        const f = normal[r][i];
        for (let c = i; c <= n; c++) normal[r][c] -= f * normal[i][c];
      }
  }
  const values = normal.map((row) => row[n]);
  if (
    solved &&
    consistent.some((d) => {
      const value =
        d.value *
        (d.unit && d.unit !== unit ? (d.unit === "cm" ? 10 : 0.1) : 1);
      return (
        Math.abs(values[idx(d.end)] - values[idx(d.start)] - value) >
        Math.max(1e-6, value * 0.001)
      );
    })
  )
    return {
      map: (v) => (v - low) * scale,
      scale,
      source: "manual",
      conflict: true,
      known: false,
    };

  const absolute = (v: number) => {
    const nearest = idx(v);
    if (Math.abs(v - anchors[nearest]) <= snap)
      return solved ? values[nearest] : anchors[nearest] * scale;
    let i = anchors.findIndex((a) => a > v);
    if (!solved || i <= 0)
      return (
        (solved ? values[nearest] : anchors[nearest] * scale) +
        (v - anchors[nearest]) * scale
      );
    if (i < 0) i = n - 1;
    return (
      values[i - 1] +
      ((v - anchors[i - 1]) * (values[i] - values[i - 1])) /
        (anchors[i] - anchors[i - 1])
    );
  };
  const zero = absolute(low);
  return {
    map: (v) => absolute(v) - zero,
    scale,
    source: "dimension",
    conflict: false,
    known: true,
  };
}
export function calibrateAnalysis(
  analysis: DrawingAnalysis,
  unit: "mm" | "cm",
  fallback: { width: number; height: number },
): {
  contours: Contour[];
  width: number;
  height: number;
  analysis: DrawingAnalysis;
} {
  const invalid = analysis.dimensions.some(
    (d) =>
      d.accepted &&
      (!Number.isFinite(d.value) ||
        d.value <= 0 ||
        !Number.isFinite(d.start) ||
        !Number.isFinite(d.end) ||
        d.end <= d.start),
  );
  const b = bounds([analysis.rawOutline]),
    snap =
      analysis.method === "raster"
        ? Math.max(2, analysis.pixelUncertainty * 1.5)
        : Math.max(
            1e-9,
            Math.max(analysis.objectBox[2], analysis.objectBox[3]) * 0.005,
          );
  const u = axisMapping(
      analysis.dimensions,
      "u",
      unit,
      b.min[0],
      b.max[0],
      snap,
    ),
    v = axisMapping(analysis.dimensions, "v", unit, b.min[1], b.max[1], snap);
  if (!u.known && v.known && !u.conflict) {
    u.map = (x) => (x - b.min[0]) * v.scale;
    u.source = "scale";
    u.known = true;
  }
  if (!v.known && u.known && !v.conflict) {
    v.map = (y) => (y - b.min[1]) * u.scale;
    v.source = "scale";
    v.known = true;
  }
  const width = u.known ? u.map(b.max[0]) : fallback.width,
    height = v.known ? v.map(b.max[1]) : fallback.height;
  const points = analysis.rawOutline.map(
    (p) =>
      [
        u.known
          ? u.map(p[0]) / width
          : (p[0] - b.min[0]) / (b.max[0] - b.min[0]),
        v.known
          ? 1 - v.map(p[1]) / height
          : 1 - (p[1] - b.min[1]) / (b.max[1] - b.min[1]),
      ] as Point,
  );
  const notes = [...analysis.notes.filter((n) => !n.startsWith("尺寸："))];
  if (invalid)
    notes.push("尺寸：已采用的读数无效，请填写大于零的尺寸或取消采用该项。");
  if (u.conflict || v.conflict)
    notes.push(
      "尺寸：标注数字与尺寸链不一致，请在尺寸读取中修正或取消错误读数。",
    );
  if (!u.known && !v.known)
    notes.push("尺寸：未找到可靠尺寸，请输入实际宽高；默认值不是识别结果。");
  else if (u.source === "scale" || v.source === "scale")
    notes.push(
      "尺寸：仅一个方向存在尺寸标注，另一个方向按同一扫描比例换算，请核对。",
    );
  if (analysis.dimensions.length && !analysis.dimensions.some((d) => d.unit))
    notes.push(`尺寸：图中未读出单位，数值按当前 ${unit} 解释。`);
  return {
    contours: [
      {
        id: "part-outline",
        points,
        role: "region",
        selected: true,
        closed: true,
      },
    ],
    width: Math.round(width * 10000) / 10000,
    height: Math.round(height * 10000) / 10000,
    analysis: {
      ...analysis,
      dimensionConflict: invalid || u.conflict || v.conflict,
      status:
        u.known &&
        v.known &&
        !u.conflict &&
        !v.conflict &&
        !invalid &&
        analysis.alternatives.length === 0
          ? "ready"
          : invalid || u.conflict || v.conflict || analysis.alternatives.length
            ? "review"
            : "needs-size",
      widthSource: u.source,
      heightSource: v.source,
      notes,
    },
  };
}
