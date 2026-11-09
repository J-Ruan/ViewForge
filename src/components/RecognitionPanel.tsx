import {
  CheckCircle2,
  ScanLine,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import type { Drawing, DimensionReading } from "../types";
import { calibrateAnalysis } from "../recognition/dimensions";
export function RecognitionPanel({
  drawing: d,
  unit,
  onChange,
  advanced,
  onAdvanced,
  showSource,
  onSource,
  onUpload,
}: {
  drawing: Drawing;
  unit: "mm" | "cm";
  onChange: (d: Drawing | ((d: Drawing) => Drawing)) => void;
  advanced: boolean;
  onAdvanced: () => void;
  showSource: boolean;
  onSource: () => void;
  onUpload: () => void;
}) {
  const a = d.analysis;
  if (!a) return null;
  const revise = (id: string, patch: Partial<DimensionReading>) =>
    onChange((current) => {
      const analysis = current.analysis!;
      const next = calibrateAnalysis(
        {
          ...analysis,
          dimensions: analysis.dimensions.map((r) =>
            r.id === id ? { ...r, ...patch } : r,
          ),
        },
        unit,
        current,
      );
      return { ...current, ...next, confirmed: false };
    });
  return (
    <div className="recognition-panel">
      <div className="recognition-status">
        <CheckCircle2 size={17} />
        <div>
          <strong>已提取零件轮廓</strong>
          <span>
            标注与标题已隔离 · {d.contours[0]?.points.length || 0} 个顶点
          </span>
        </div>
        <button title="更换图纸" aria-label="更换图纸" onClick={onUpload}>
          <Upload size={14} />
        </button>
      </div>
      <div className={`recognized-size ${a.status === "ready" ? "ready" : ""}`}>
        <ScanLine size={15} />
        <div>
          <span>
            {a.status === "ready"
              ? "已读取尺寸"
              : a.status === "review"
                ? "识别结果需要确认"
                : "未读到可靠尺寸，请填写实际宽高"}
          </span>
          {d.width > 0 && d.height > 0 && (
            <strong data-testid="recognized-size">
              {d.width} × {d.height} <small>{unit}</small>
            </strong>
          )}
        </div>
      </div>
      {a.dimensionConflict && (
        <p className="recognition-review" aria-live="polite">
          尺寸读数矛盾或无效，请修改数值或取消采用对应标注。
        </p>
      )}
      {a.dimensions.length > 0 && (
        <details className="dimension-evidence">
          <summary>{a.dimensions.length} 处尺寸标注 · 查看与修正</summary>
          <p>数值与尺寸线关联后用于校准。修改读数会重新标定原始轮廓。</p>
          {a.dimensions.map((r, i) => (
            <label className="dimension-reading" key={r.id}>
              <input
                type="checkbox"
                aria-label={`采用尺寸 ${i + 1}`}
                checked={r.accepted}
                onChange={(e) => revise(r.id, { accepted: e.target.checked })}
              />
              <span>
                {r.axis === "u" ? "横向" : "纵向"}{" "}
                {r.source === "manual" ? "· 已修正" : ""}
              </span>
              <input
                aria-label={`识别尺寸 ${i + 1}`}
                type="number"
                min=".001"
                step="any"
                value={r.value}
                onChange={(e) =>
                  revise(r.id, {
                    value: +e.target.value,
                    text: e.target.value,
                    source: "manual",
                  })
                }
              />
              <small>{r.unit || unit}</small>
            </label>
          ))}
        </details>
      )}
      {a.alternatives.length > 0 && (
        <div className="recognition-review">
          <p>存在多个较大封闭区域，请选择零件：</p>
          <button
            onClick={() =>
              onChange({
                ...d,
                analysis: { ...a, alternatives: [] },
                confirmed: false,
              })
            }
          >
            保留当前轮廓
          </button>
          {a.alternatives.map((p, i) => (
            <button
              key={i}
              onClick={() => {
                const next = calibrateAnalysis(
                  { ...a, rawOutline: p, alternatives: [] },
                  unit,
                  d,
                );
                onChange({ ...d, ...next, confirmed: false });
              }}
            >
              候选 {i + 2}
            </button>
          ))}
        </div>
      )}
      <div className="recognition-actions">
        <button onClick={onSource}>
          {showSource ? "查看净轮廓" : "原图与识别依据"}
        </button>
        <button onClick={onAdvanced}>
          <SlidersHorizontal size={12} />
          {advanced ? "收起高级编辑" : "高级编辑"}
        </button>
      </div>
      <details className="recognition-notes">
        <summary>识别说明</summary>
        {a.notes.map((n, i) => (
          <p key={i}>{n}</p>
        ))}
      </details>
    </div>
  );
}
