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
      ![d.width, d.height].every((v) => Number.isFinite(v) && v > 0) ||
      typeof d.confirmed !== "boolean" ||
      typeof d.mirror !== "boolean" ||
      !Array.isArray(d.warnings) ||
      !d.warnings.every((w) => typeof w === "string") ||
      (d.sourceData !== undefined && typeof d.sourceData !== "string") ||
      (d.sourceName !== undefined && typeof d.sourceName !== "string")
    )
      throw new Error("视图参数无效。");
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
