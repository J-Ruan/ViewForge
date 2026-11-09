import { binarize, extractSilhouette } from "../src/recognition/raster";
import { it, expect } from "vitest";
import { example } from "../src/examples";
import { deserialize, serialize } from "../src/io/project";
import { parseDxf } from "../src/io/import";
it("round trips original drawings, calibration and features", () => {
  const p = example(5);
  p.views[0].sourceData = "original-dxf";
  expect(deserialize(serialize(p))).toEqual(p);
});
it("rejects corrupt projects", () => {
  expect(() => deserialize('{"version":2}')).toThrow();
  const p = example();
  p.views[0].contours[0].points[0][0] = NaN;
  expect(() => deserialize(serialize(p))).toThrow("轮廓");
});
it("parses real DXF LINE loops and rejects unsupported entity types", () => {
  const codes = ["0", "SECTION", "2", "ENTITIES"];
  for (const [a, b] of [
    [
      [0, 0],
      [80, 0],
    ],
    [
      [80, 0],
      [80, 60],
    ],
    [
      [80, 60],
      [0, 60],
    ],
    [
      [0, 60],
      [0, 0],
    ],
  ])
    codes.push(
      "0",
      "LINE",
      "8",
      "0",
      "10",
      String(a[0]),
      "20",
      String(a[1]),
      "11",
      String(b[0]),
      "21",
      String(b[1]),
    );
  codes.push("0", "ENDSEC", "0", "EOF");
  const parsed = parseDxf(codes.join("\n"));
  expect(parsed.contours).toHaveLength(1);
  expect(parsed.contours[0].closed).toBe(true);
  expect(() =>
    parseDxf("0\nSECTION\n2\nENTITIES\n0\nSPLINE\n0\nENDSEC\n0\nEOF"),
  ).toThrow("SPLINE");
});
it("traces raster outlines without misreading stroke interiors as holes", () => {
  const w = 50,
    h = 40,
    p = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 5; y < 35; y++)
    for (let x = 5; x < 45; x++)
      if (x < 7 || x > 42 || y < 7 || y > 32) {
        const i = (y * w + x) * 4;
        p[i] = p[i + 1] = p[i + 2] = 0;
      }
  const c = extractSilhouette(binarize(p, w, h), w, h);
  expect(c.points).toHaveLength(4);
  expect(c.stroke).toBe(2);
});
it("reads native DXF linear dimensions and excludes text instead of asking users to delete labels", () => {
  const codes = [
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    "0",
    "LWPOLYLINE",
    "90",
    "4",
    "70",
    "1",
    "10",
    "0",
    "20",
    "0",
    "10",
    "900",
    "20",
    "0",
    "10",
    "900",
    "20",
    "600",
    "10",
    "0",
    "20",
    "600",
  ];
  for (const [angle, x, y, value] of [
    [0, 900, 0, 90],
    [90, 0, 600, 60],
  ])
    codes.push(
      "0",
      "DIMENSION",
      "70",
      "0",
      "50",
      String(angle),
      "13",
      "0",
      "23",
      "0",
      "14",
      String(x),
      "24",
      String(y),
      "42",
      String(value),
    );
  codes.push(
    "0",
    "TEXT",
    "1",
    "Title",
    "10",
    "400",
    "20",
    "800",
    "40",
    "30",
    "0",
    "ENDSEC",
    "0",
    "EOF",
  );
  const p = parseDxf(codes.join("\n"));
  expect(p.width).toBe(90);
  expect(p.height).toBe(60);
  expect(p.contours).toHaveLength(1);
  expect(p.analysis?.dimensions).toHaveLength(2);
});
