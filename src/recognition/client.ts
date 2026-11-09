import type { DrawingAnalysis } from "../types";
import { calibrateAnalysis } from "./dimensions";
export function recognizeRaster(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  threshold: number,
  unit: "mm" | "cm",
  width: number,
  height: number,
): Promise<ReturnType<typeof calibrateAnalysis>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      }),
      timer = setTimeout(() => {
        worker.terminate();
        reject(new Error("图纸识别超过 20 秒，请缩小图片或使用清晰的单视图。"));
      }, 20000);
    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.result);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error("本地图纸识别 Worker 加载失败。"));
    };
    worker.postMessage({ rgba, w, h, threshold, unit, width, height }, [
      rgba.buffer,
    ]);
  });
}
