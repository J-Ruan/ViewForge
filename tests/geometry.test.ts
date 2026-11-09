import { beforeAll, describe, it, expect } from "vitest";
import Module, { type ManifoldToplevel } from "manifold-3d";
import {
  reconstruct,
  viewMatrix,
  projectionMatrix,
} from "../src/geometry/engine";
import { example, drawing, contour } from "../src/examples";
import { area, calibrated, cleanRing } from "../src/geometry/polygon";
let api: ManifoldToplevel;
beforeAll(async () => {
  api = await Module();
  api.setup();
});
describe("real WASM geometry", () => {
  it.each([
    ["front", "top"],
    ["front", "side"],
    ["top", "side"],
  ] as const)("reconstructs box using %s + %s", (a, b) => {
    const p = example(0),
      sizes = { front: [80, 60], top: [80, 50], side: [50, 60] };
    p.views = [
      drawing(a, ...(sizes[a] as [number, number])),
      drawing(b, ...(sizes[b] as [number, number])),
    ];
    const m = reconstruct(api, p);
    expect(m.volume).toBeCloseTo(240000, 4);
    expect(m.bounds).toEqual({ min: [0, 0, 0], max: [80, 50, 60] });
    expect(m.checks.every((c) => c.iou > 0.99999)).toBe(true);
  });
  it.each([1, 2, 3])("handles nonconvex / slope sample %i", (i) => {
    const p = example(i),
      m = reconstruct(api, p);
    expect(m.volume).toBeCloseTo(
      Math.abs(area(p.views[0].contours[0].points)) * 80 * 60 * 50,
      3,
    );
    expect(m.checks[0].iou).toBeCloseTo(1, 6);
  });
  it("handles explicit nested holes", () => {
    const m = reconstruct(api, example(4));
    expect(m.volume).toBeGreaterThan(220000);
    expect(m.volume).toBeLessThan(222000);
    expect(m.checks[1].iou).toBeCloseTo(1, 5);
  });
  it("keeps separate contours", () => {
    const p = example(0);
    p.views[1].contours = [
      contour(
        [
          [0, 0],
          [0.3, 0],
          [0.3, 1],
          [0, 1],
        ],
        "a",
      ),
      contour(
        [
          [0.7, 0],
          [1, 0],
          [1, 1],
          [0.7, 1],
        ],
        "b",
      ),
    ];
    p.views[0].contours = structuredClone(p.views[1].contours);
    expect(reconstruct(api, p).volume).toBeCloseTo(144000, 3);
  });
  it("subtracts round and rectangular holes along all axes", () => {
    for (const axis of ["x", "y", "z"] as const) {
      const p = example(0);
      p.features = [
        {
          id: "hole",
          type: "circle",
          axis,
          position: [20, 20, 20],
          radius: 5,
          width: 10,
          height: 10,
          depth: 10,
        },
      ];
      expect(reconstruct(api, p).volume).toBeCloseTo(
        240000 - (96 / 2) * 25 * Math.sin((2 * Math.PI) / 96) * 10,
        3,
      );
      p.features[0].type = "rectangle";
      expect(reconstruct(api, p).volume).toBeCloseTo(239000, 3);
    }
  });
  it("reports changed projection after groove", () => {
    const m = reconstruct(api, example(5));
    expect(m.volume).toBeCloseTo(210000, 3);
    expect(m.checks[0].iou).toBeLessThan(1);
    expect(m.baseChecks[0].iou).toBeCloseTo(1);
  });
  it("rejects mismatched dimensions and empty intersections", () => {
    const p = example(0);
    p.views[1].width = 60;
    expect(() => reconstruct(api, p)).toThrow("冲突");
    p.views[1].offset = [100, 0];
    expect(() => reconstruct(api, p)).toThrow("为空");
  });
  it("scales cm into mm, handles offsets and mirrors", () => {
    const p = example(1);
    p.unit = "cm";
    const m = reconstruct(api, p);
    expect(m.bounds.max).toEqual([800, 500, 600]);
    p.views.forEach((v) => (v.offset = [2, 3]));
    expect(calibrated(p.views[0], "cm")[0][0]).toEqual([20, 30]);
    p.views[0].mirror = true;
    expect(calibrated(p.views[0], "cm")[0][0]).toEqual([820, 30]);
  });
  it("maps asymmetrical left-side contour back to canonical coordinates", () => {
    const p = example(0);
    p.views = [
      drawing("front", 80, 60),
      drawing("side", 50, 60, [
        [0, 0],
        [1, 0],
        [1, 0.5],
        [0, 1],
      ]),
    ];
    const r = reconstruct(api, p);
    p.side = "left";
    p.views[1].mirror = true;
    expect(reconstruct(api, p).volume).toBeCloseTo(r.volume, 4);
  });
  it("requires confirmed closed regions", () => {
    const p = example(0);
    p.views[0].confirmed = false;
    expect(() => reconstruct(api, p)).toThrow("确认");
    p.views[0].confirmed = true;
    p.views[0].contours[0].closed = false;
    expect(() => reconstruct(api, p)).toThrow("未闭合");
  });
  it("repeated rebuilds preserve volume", () => {
    for (let i = 0; i < 50; i++)
      expect(reconstruct(api, example(2)).volume).toBeGreaterThan(100000);
  });
});
describe("polygon / coordinate validation", () => {
  it("cleans repeated closure", () =>
    expect(
      cleanRing([
        [0, 0],
        [1, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ]),
    ).toHaveLength(3));
  it.each([
    {
      p: [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
    },
    {
      p: [
        [0, 0],
        [1, 1],
        [0, 1],
        [1, 0],
      ],
    },
    {
      p: [
        [0, 0],
        [Infinity, 1],
        [0, 1],
      ],
    },
  ])("rejects degenerate geometry", ({ p }) =>
    expect(() => cleanRing(p as [number, number][])).toThrow(),
  );
  it.each(["front", "top", "side"] as const)(
    "coordinate matrices are inverses: %s",
    (kind) => {
      const a = viewMatrix(kind),
        b = projectionMatrix(kind),
        v = [2, 3, 4, 1],
        mul = (m: number[], x: number[]) =>
          Array.from({ length: 4 }, (_, r) =>
            x.reduce((s, t, c) => s + m[c * 4 + r] * t, 0),
          );
      expect(mul(b, mul(a, v))).toEqual(v);
    },
  );
});
it("accepts only spatially bounded scan error, preserving actual IoU", () => {
  const p = example(0);
  p.views[1].analysis = {
    method: "raster",
    status: "ready",
    rawOutline: [
      [0, 0],
      [800, 0],
      [800, 500],
      [0, 500],
    ],
    objectBox: [0, 0, 800, 500],
    imageSize: [900, 600],
    dimensions: [],
    pixelUncertainty: 3,
    alternatives: [],
    notes: [],
    widthSource: "dimension",
    heightSource: "dimension",
  };
  p.views[1].width = 80.15;
  const r = reconstruct(api, p);
  expect(r.baseChecks[1].iou).toBeLessThan(0.999);
  expect(r.baseChecks[1].withinScanTolerance).toBe(true);
  expect(r.warnings).toHaveLength(1);
  p.views[1].width = 90;
  expect(() => reconstruct(api, p)).toThrow("公共轴尺寸冲突");
});
