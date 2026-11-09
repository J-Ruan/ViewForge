import { openDB } from "idb";
import type { Project } from "../types";
const db = () =>
  openDB("viewforge", 1, {
    upgrade(db) {
      db.createObjectStore("projects");
    },
  });
export const serialize = (p: Project) => JSON.stringify(p, null, 2);
export function deserialize(text: string): Project {
  if (text.length > 36 * 1024 * 1024) throw new Error("项目文件超过 36 MB。");
  const p = JSON.parse(text) as Project;
  if (
    !p ||
    typeof p !== "object" ||
    p.version !== 1 ||
    typeof p.name !== "string" ||
    p.name.length > 200 ||
    !["mm", "cm"].includes(p.unit) ||
    !["first", "third"].includes(p.projection) ||
    !["left", "right"].includes(p.side) ||
    !Array.isArray(p.views) ||
    p.views.length !== 2 ||
    !Array.isArray(p.features) ||
    p.features.length > 64 ||
    typeof p.note !== "string"
  )
    throw new Error("无效的 ViewForge v1 项目。");
  for (const d of p.views) {
    if (
      !d ||
      typeof d !== "object" ||
      !["front", "top", "side"].includes(d.kind) ||
      !Array.isArray(d.contours) ||
      d.contours.length > 128 ||
      !Array.isArray(d.originalContours) ||
      d.originalContours.length > 128 ||
      !Array.isArray(d.offset) ||
      d.offset.length !== 2 ||
      !d.offset.every(Number.isFinite) ||
      ![d.width, d.height].every(
        (v) => Number.isFinite(v) && (d.confirmed ? v > 0 : v >= 0),
      ) ||
      typeof d.confirmed !== "boolean" ||
      typeof d.mirror !== "boolean" ||
      !Array.isArray(d.warnings) ||
      !d.warnings.every((w) => typeof w === "string") ||
      (d.sourceData !== undefined && typeof d.sourceData !== "string") ||
      (d.sourceName !== undefined && typeof d.sourceName !== "string")
    )
      throw new Error("视图参数无效。");
    if (d.analysis) {
      const a = d.analysis,
        points = (v: unknown): boolean =>
          Array.isArray(v) &&
          v.length <= 1500 &&
          v.every(
            (p) =>
              Array.isArray(p) &&
              p.length === 2 &&
              p.every(
                (n) =>
                  typeof n === "number" &&
                  Number.isFinite(n) &&
                  Math.abs(n) < 1e6,
              ),
          );
      if (
        (a.dimensionConflict !== undefined &&
          typeof a.dimensionConflict !== "boolean") ||
        !["raster", "svg", "dxf"].includes(a.method) ||
        !["ready", "review", "needs-size"].includes(a.status) ||
        !Array.isArray(a.imageSize) ||
        a.imageSize.length !== 2 ||
        !a.imageSize.every((n) => Number.isFinite(n) && n > 0) ||
        !Array.isArray(a.objectBox) ||
        a.objectBox.length !== 4 ||
        !a.objectBox.every(Number.isFinite) ||
        a.objectBox[2] <= 0 ||
        a.objectBox[3] <= 0 ||
        !points(a.rawOutline) ||
        !Number.isFinite(a.pixelUncertainty) ||
        a.pixelUncertainty < 0 ||
        a.pixelUncertainty > 100 ||
        !Array.isArray(a.alternatives) ||
        a.alternatives.length > 12 ||
        !a.alternatives.every(points) ||
        !Array.isArray(a.notes) ||
        !a.notes.every((n) => typeof n === "string") ||
        !Array.isArray(a.dimensions) ||
        a.dimensions.length > 128 ||
        !a.dimensions.every(
          (r) =>
            r &&
            typeof r.id === "string" &&
            typeof r.text === "string" &&
            ["u", "v"].includes(r.axis) &&
            [r.value, r.start, r.end, r.score].every(Number.isFinite) &&
            Array.isArray(r.labelBox) &&
            r.labelBox.length === 4 &&
            r.labelBox.every(Number.isFinite) &&
            typeof r.accepted === "boolean" &&
            ["template", "vector", "dxf", "manual"].includes(r.source),
        ) ||
        !["dimension", "scale", "manual"].includes(a.widthSource) ||
        !["dimension", "scale", "manual"].includes(a.heightSource)
      )
        throw new Error("项目包含无效的识别与尺寸记录。");
    }
    for (const c of [...d.contours, ...d.originalContours])
      if (
        !c ||
        typeof c !== "object" ||
        !Array.isArray(c.points) ||
        c.points.length > 1500 ||
        !c.points.every(
          (v) =>
            Array.isArray(v) &&
            v.length === 2 &&
            v.every((x) => Number.isFinite(x) && Math.abs(x) < 1e6),
        ) ||
        !["region", "reference", "hidden"].includes(c.role) ||
        typeof c.closed !== "boolean" ||
        typeof c.selected !== "boolean" ||
        typeof c.id !== "string"
      )
        throw new Error("项目包含无效轮廓。");
  }
  for (const f of p.features)
    if (
      !f ||
      typeof f !== "object" ||
      !["circle", "rectangle", "groove", "cut"].includes(f.type) ||
      !["x", "y", "z"].includes(f.axis) ||
      !Array.isArray(f.position) ||
      f.position.length !== 3 ||
      ![...f.position, f.width, f.height, f.radius, f.depth].every(
        Number.isFinite,
      ) ||
      typeof f.id !== "string"
    )
      throw new Error("项目包含无效特征。");
  return p;
}
export async function saveProject(p: Project) {
  const store = await db();
  await store.put("projects", serialize(p), "latest");
  store.close();
}
export async function loadProject() {
  const store = await db();
  const text = await store.get("projects", "latest");
  store.close();
  return text ? deserialize(text) : null;
}
export function download(
  data: BlobPart,
  name: string,
  type = "application/octet-stream",
) {
  const url = URL.createObjectURL(new Blob([data], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
