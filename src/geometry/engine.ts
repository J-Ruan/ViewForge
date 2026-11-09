import type {
  CrossSection,
  Manifold,
  ManifoldToplevel,
  Mat4,
} from "manifold-3d";
import type {
  Feature,
  ModelResult,
  Project,
  ProjectionCheck,
  ViewKind,
} from "../types";
import { bounds, calibrated } from "./polygon";
export const axes: Record<ViewKind, [number, number, number]> = {
  front: [0, 2, 1],
  top: [0, 1, 2],
  side: [1, 2, 0],
};
// Column-major orthonormal maps: local (u,v,extrusion) -> world (X,Y,Z).
export function viewMatrix(kind: ViewKind, offset = 0): Mat4 {
  const a = axes[kind];
  const m = new Array(16).fill(0);
  m[15] = 1;
  m[a[0]] = 1;
  m[4 + a[1]] = 1;
  m[8 + a[2]] = 1;
  m[12 + a[2]] = offset;
  return m as Mat4;
}
export function projectionMatrix(kind: ViewKind): Mat4 {
  const a = axes[kind];
  const m = new Array(16).fill(0);
  m[15] = 1;
  m[a[0] * 4] = 1;
  m[a[1] * 4 + 1] = 1;
  m[a[2] * 4 + 2] = 1;
  return m as Mat4;
}
export function reconstruct(
  api: ManifoldToplevel,
  project: Project,
): ModelResult {
  const owned: { delete(): void }[] = [];
  const keep = <T extends { delete(): void }>(obj: T): T => {
    owned.push(obj);
    return obj;
  };
  try {
    if (
      project.views.length !== 2 ||
      project.views[0].kind === project.views[1].kind
    )
      throw new Error("请选择两个不同的标准正投影视图。");
    if (project.views.some((d) => !d.confirmed))
      throw new Error("请检查两个视图的轮廓和实际尺寸，并确认校准。");
    const sections = project.views.map((d) =>
      keep(
        new api.CrossSection(
          calibrated(
            d,
            project.unit,
            d.kind === "side" && project.side === "left",
          ),
          "EvenOdd",
        ),
      ),
    );
    const range = [
      [-Infinity, Infinity],
      [-Infinity, Infinity],
      [-Infinity, Infinity],
    ];
    project.views.forEach((d, i) => {
      const b = bounds(sections[i].toPolygons());
      axes[d.kind].slice(0, 2).forEach((axis, k) => {
        range[axis][0] = Math.max(range[axis][0], b.min[k]);
        range[axis][1] = Math.min(range[axis][1], b.max[k]);
      });
    });
    if (range.some((r) => !r.every(Number.isFinite) || r[1] - r[0] < 1e-6))
      throw new Error(
        "两个视图的公共坐标轴不重叠，交集为空。请检查尺寸与对齐偏移。",
      );
    const extrusions = sections.map((s, i) => {
      const kind = project.views[i].kind,
        axis = axes[kind][2];
      const solid = keep(s.extrude(range[axis][1] - range[axis][0]));
      return keep(solid.transform(viewMatrix(kind, range[axis][0])));
    });
    let model: Manifold = keep(extrusions[0].intersect(extrusions[1]));
    if (model.status() !== "NoError" || model.isEmpty())
      throw new Error("轮廓交集为空或几何无效。请检查所选区域。");
    const check = (m: Manifold): ProjectionCheck[] =>
      project.views.map((d, i) => {
        const transformed = keep(m.transform(projectionMatrix(d.kind))),
          projected = keep(transformed.project());
        const intersection = keep(sections[i].intersect(projected)),
          union = keep(sections[i].add(projected));
        const missing = keep(sections[i].subtract(projected)),
          extra = keep(projected.subtract(sections[i]));
        return {
          kind: d.kind,
          iou: intersection.area() / union.area(),
          input: sections[i].toPolygons(),
          projected: projected.toPolygons(),
          missing: missing.toPolygons(),
          extra: extra.toPolygons(),
        };
      });
    const baseChecks = check(model);
    if (baseChecks.some((c) => c.iou < 0.999))
      throw new Error(
        `视图约束冲突：基础交集无法完整还原输入轮廓（最低 IoU ${(Math.min(...baseChecks.map((c) => c.iou)) * 100).toFixed(2)}%）。请重新校准或调整区域。`,
      );
    if (project.features.length > 64)
      throw new Error("最多支持 64 个切除特征。");
    for (const f of project.features) {
      const tool = makeTool(api, f, keep);
      const next = keep(model.subtract(tool));
      if (next.status() !== "NoError" || next.isEmpty())
        throw new Error("切除后实体为空或无效，请缩小特征尺寸或调整位置。");
      if (model.volume() - next.volume() < 1e-7)
        throw new Error("切除特征未与模型相交，请检查位置、方向和深度。");
      model = next;
    }
    const checks = project.features.length ? check(model) : baseChecks;
    const mesh = model.getMesh();
    const positions = new Float32Array(mesh.numVert * 3);
    for (let i = 0; i < mesh.numVert; i++)
      positions.set(
        mesh.vertProperties.subarray(i * mesh.numProp, i * mesh.numProp + 3),
        i * 3,
      );
    return {
      positions,
      indices: new Uint32Array(mesh.triVerts),
      volume: model.volume(),
      bounds: model.boundingBox(),
      checks,
      baseChecks,
      triangles: mesh.numTri,
    };
  } finally {
    for (let i = owned.length - 1; i >= 0; i--) owned[i].delete();
  }
}
function makeTool(
  api: ManifoldToplevel,
  f: Feature,
  keep: <T extends { delete(): void }>(v: T) => T,
): Manifold {
  const n = [...f.position, f.width, f.height, f.depth, f.radius];
  if (
    n.some((x) => !Number.isFinite(x) || Math.abs(x) > 20000) ||
    [f.width, f.height, f.depth, f.radius].some((x) => x <= 0)
  )
    throw new Error("特征尺寸必须为正数，坐标范围 ±20000 mm。");
  const basic = keep(
    f.type === "circle"
      ? api.Manifold.cylinder(f.depth, f.radius, f.radius, 96)
      : api.Manifold.cube([f.width, f.height, f.depth]),
  );
  // Circular holes: position is start center. Rectangular cuts: position is start lower corner.
  const kind = f.axis === "x" ? "side" : f.axis === "y" ? "front" : "top";
  const mapped = keep(basic.transform(viewMatrix(kind)));
  return keep(mapped.translate(f.position));
}
