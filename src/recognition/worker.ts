import { binarize, extractSilhouette } from "./raster";
import { createGlyphs, readNumerals } from "./numerals";
import { associateDimensions, calibrateAnalysis } from "./dimensions";
import type { DrawingAnalysis } from "../types";
self.onmessage = (
  e: MessageEvent<{
    rgba: Uint8ClampedArray;
    w: number;
    h: number;
    threshold: number;
    unit: "mm" | "cm";
    width: number;
    height: number;
  }>,
) => {
  try {
    const { rgba, w, h, threshold, unit, width, height } = e.data,
      ink = binarize(rgba, w, h, threshold),
      shape = extractSilhouette(ink, w, h),
      labels = readNumerals(ink, w, h, createGlyphs()),
      dimensions = associateDimensions(ink, w, h, labels).filter((d) => {
        const [x, y, bw, bh] = d.labelBox,
          [sx, sy, sw, sh] = shape.box;
        return x + bw < sx || x > sx + sw || y + bh < sy || y > sy + sh;
      });
    const analysis: DrawingAnalysis = {
      method: "raster",
      status: "needs-size",
      imageSize: [w, h],
      objectBox: shape.box,
      rawOutline: shape.points,
      dimensions,
      pixelUncertainty: Math.max(1.5, shape.stroke / 2),
      alternatives: shape.ambiguous ? shape.alternatives : [],
      notes: [
        "已按封闭区域提取零件，标题、数字、箭头与尺寸线不参与重建。",
        "内部线条未擅自解释为孔；需要时可在高级编辑中添加。",
      ],
      widthSource: "manual",
      heightSource: "manual",
    };
    self.postMessage({
      result: calibrateAnalysis(analysis, unit, { width, height }),
      debug: { labels },
    });
  } catch (e) {
    self.postMessage({ error: e instanceof Error ? e.message : "识别失败。" });
  }
};
