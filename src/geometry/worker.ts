import Module from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { reconstruct } from "./engine";
import type { Project } from "../types";
const api = Module({ locateFile: () => wasmUrl }).then((m) => {
  m.setup();
  return m;
});
self.onmessage = async (e: MessageEvent<{ id: number; project: Project }>) => {
  try {
    const result = reconstruct(await api, e.data.project);
    self.postMessage(
      { id: e.data.id, result },
      { transfer: [result.positions.buffer, result.indices.buffer] },
    );
  } catch (err) {
    self.postMessage({
      id: e.data.id,
      error: err instanceof Error ? err.message : "几何计算失败。",
    });
  }
};
