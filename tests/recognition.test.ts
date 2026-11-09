import { it, expect } from "vitest";
import { binarize, extractSilhouette } from "../src/recognition/raster";
import {
  calibrateAnalysis,
  associateDimensions,
} from "../src/recognition/dimensions";
import type { DrawingAnalysis, DimensionReading } from "../src/types";
const dim = (
  axis: "u" | "v",
  start: number,
  end: number,
  value: number,
  id = "a",
): DimensionReading => ({
  id,
  text: String(value),
  value,
  axis,
  start,
  end,
  labelBox: [0, 0, 10, 10],
  score: 1,
  source: "template",
  accepted: true,
});
const analysis = (): DrawingAnalysis => ({
  method: "raster",
  status: "needs-size",
  imageSize: [1200, 900],
  objectBox: [100, 100, 900, 560],
  rawOutline: [
    [100, 100],
    [397, 100],
    [397, 283],
    [700, 283],
    [700, 477],
    [1000, 477],
    [1000, 660],
    [100, 660],
  ],
  dimensions: [
    dim("u", 100, 400, 30),
    dim("u", 400, 700, 30),
    dim("u", 700, 1000, 30),
    dim("u", 100, 1000, 90),
    dim("v", 100, 285, 20),
    dim("v", 285, 475, 20),
    dim("v", 475, 660, 20),
    dim("v", 100, 660, 60),
  ],
  pixelUncertainty: 4,
  alternatives: [],
  notes: [],
  widthSource: "manual",
  heightSource: "manual",
});
it("calibrates a staircase from overall and chained dimensions, snapping raster jitter to measured anchors", () => {
  const r = calibrateAnalysis(analysis(), "mm", { width: 0, height: 0 });
  expect(r.width).toBe(90);
  expect(r.height).toBe(60);
  expect(r.analysis.status).toBe("ready");
  expect(r.contours).toHaveLength(1);
  expect(r.contours[0].points[1][0]).toBeCloseTo(1 / 3, 6);
  expect(r.contours[0].points[2][1]).toBeCloseTo(2 / 3, 6);
});
it("rejects an inconsistent dimension chain rather than averaging dimensions into an apparently valid result", () => {
  const a = analysis();
  a.dimensions[3].value = 89;
  const r = calibrateAnalysis(a, "mm", { width: 0, height: 0 });
  expect(r.analysis.status).toBe("review");
  expect(r.width).toBe(0);
  expect(r.analysis.notes.join("")).toContain("不一致");
});
it("does not use unrelated OCR text as a dimension", () => {
  expect(
    associateDimensions(new Uint8Array(100 * 100), 100, 100, [
      { text: "90", value: 90, box: [30, 30, 20, 10], score: 1 },
    ]),
  ).toEqual([]);
});
it("converts explicitly marked cm and defaults no-unit labels to the selected project unit", () => {
  const a = analysis();
  a.dimensions.forEach((d) => (d.unit = "cm"));
  const r = calibrateAnalysis(a, "mm", { width: 0, height: 0 });
  expect(r.width).toBe(900);
  expect(r.height).toBe(600);
});
it("does not pretend default dimensions came from recognition", () => {
  const a = analysis();
  a.dimensions = [];
  const r = calibrateAnalysis(a, "mm", { width: 0, height: 0 });
  expect(r.analysis.status).toBe("needs-size");
  expect(r.width).toBe(0);
  expect(r.height).toBe(0);
  expect(r.contours[0].selected).toBe(true);
});
it("derives an unannotated axis using an explicitly reported uniform scan scale", () => {
  const a = analysis();
  a.dimensions = a.dimensions.filter((d) => d.axis === "u");
  const r = calibrateAnalysis(a, "mm", { width: 0, height: 0 });
  expect(r.height).toBeCloseTo(56, 4);
  expect(r.analysis.heightSource).toBe("scale");
  expect(r.analysis.notes.join("")).toContain("比例换算");
});
it("preserves alpha compositing during thresholding", () => {
  expect([
    ...binarize(new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255]), 2, 1),
  ]).toEqual([0, 1]);
});
it("reports open / insufficient drawings instead of inventing a closed object", () => {
  expect(() => extractSilhouette(new Uint8Array(100 * 100), 100, 100)).toThrow(
    "未找到",
  );
});
it("blocks accepted zero or negative readings instead of silently falling back to previous calibration", () => {
  for (const value of [0, -1]) {
    const a = analysis();
    a.dimensions[0].value = value;
    const r = calibrateAnalysis(a, "mm", { width: 90, height: 60 });
    expect(r.analysis.status).toBe("review");
    expect(r.analysis.dimensionConflict).toBe(true);
  }
});
