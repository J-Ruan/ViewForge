import { useEffect, useRef, useState } from "react";
import {
  Check,
  Upload,
  MousePointer2,
  PenLine,
  Plus,
  Minus,
  Trash2,
  ScanLine,
  Undo2,
} from "lucide-react";
import type { Contour, Drawing, Point, ViewKind } from "../types";
import { labels, uid } from "../types";
import { contour } from "../examples";
import { RecognitionPanel } from "./RecognitionPanel";
import { importDrawing } from "../io/import";
export function DrawingEditor({
  drawing: d,
  onChange,
  index,
  onError,
  unit,
}: {
  drawing: Drawing;
  unit: "mm" | "cm";
  onChange: (d: Drawing | ((current: Drawing) => Drawing)) => void;
  index: number;
  onError: (m: string) => void;
}) {
  const svg = useRef<SVGSVGElement>(null),
    file = useRef<HTMLInputElement>(null),
    drag = useRef<{
      c: number;
      v: number;
      edge?: boolean;
      start: Point;
      points: Point[];
    } | null>(null);
  const [selected, setSelected] = useState<[number, number] | null>(null),
    [mode, setMode] = useState<"select" | "draw">("select"),
    [draft, setDraft] = useState<Point[]>([]),
    [zoom, setZoom] = useState(1),
    [threshold, setThreshold] = useState(160),
    [loading, setLoading] = useState(false),
    [advanced, setAdvanced] = useState(false),
    [showSource, setShowSource] = useState(false);
  const job = useRef(0);
  useEffect(
    () => () => {
      job.current++;
    },
    [],
  );
  const patch = (partial: Partial<Drawing>) =>
    onChange((current) => ({ ...current, ...partial, confirmed: false }));
  const at = (e: React.PointerEvent | React.MouseEvent): Point => {
    const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svg.current!.getScreenCTM()!.inverse(),
    );
    return [
      Math.round(point.x * 1000) / 1000,
      Math.round((1 - point.y) * 1000) / 1000,
    ];
  };
  const changeContour = (i: number, partial: Partial<Contour>) =>
    patch({
      contours: d.contours.map((c, k) => (k === i ? { ...c, ...partial } : c)),
    });
  const finish = () => {
    if (draft.length < 3) return;
    patch({ contours: [...d.contours, contour(draft, uid())] });
    setDraft([]);
    setMode("select");
  };
  const upload = async (f: File) => {
    const id = ++job.current;
    setLoading(true);
    try {
      const parsed = await importDrawing(f, threshold, {
        unit,
        width: 0,
        height: 0,
      });
      if (id !== job.current) return;
      onChange((current) => ({
        ...current,
        ...parsed,
        originalContours: structuredClone(parsed.contours),
        sourceName: f.name,
        confirmed: false,
      }));
      setSelected(null);
      setAdvanced(false);
      setShowSource(false);
    } catch (e) {
      if (id === job.current) onError((e as Error).message);
    } finally {
      if (id === job.current) setLoading(false);
    }
  };
  const ratio = Math.min(2, Math.max(0.5, d.height / d.width || 1));
  return (
    <section
      className={`drawing-card ${d.analysis && !advanced ? "recognition-mode" : ""}`}
      data-status={d.analysis?.status}
    >
      <fieldset
        disabled={loading}
        className="drawing-contents"
        aria-busy={loading}
      >
        <header>
          <div>
            <span className="number">0{index + 1}</span>
            <select
              aria-label={`视图 ${index + 1} 类型`}
              value={d.kind}
              onChange={(e) => patch({ kind: e.target.value as ViewKind })}
            >
              {Object.entries(labels).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
            <span className="plane">
              {d.kind === "front" ? "XZ" : d.kind === "top" ? "XY" : "YZ"}
            </span>
          </div>
          <span className={`pill ${d.confirmed ? "ok" : ""}`}>
            {d.confirmed ? "已校准" : "待确认"}
          </span>
        </header>
        {d.analysis &&
          showSource &&
          d.sourceData?.startsWith("data:image/") && (
            <div className="recognition-source">
              <svg
                viewBox={`0 0 ${d.analysis.imageSize[0]} ${d.analysis.imageSize[1]}`}
                aria-label="原图识别依据"
              >
                <image
                  href={d.sourceData}
                  width={d.analysis.imageSize[0]}
                  height={d.analysis.imageSize[1]}
                />
                <path
                  d={
                    d.analysis.rawOutline
                      .map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`)
                      .join(" ") + "Z"
                  }
                  fill="#34a07515"
                  stroke="#249c73"
                  strokeWidth="4"
                />
                {d.analysis.dimensions.map((r) => (
                  <rect
                    key={r.id}
                    x={r.labelBox[0] - 4}
                    y={r.labelBox[1] - 4}
                    width={r.labelBox[2] + 8}
                    height={r.labelBox[3] + 8}
                    fill="none"
                    stroke={r.accepted ? "#3479ed" : "#c5cad2"}
                    strokeWidth="3"
                  />
                ))}
              </svg>
              <span>绿：零件边界 · 蓝框：关联尺寸</span>
            </div>
          )}
        <div
          className="drawing-surface"
          style={{
            aspectRatio: "1.6",
            display: showSource && d.analysis ? "none" : undefined,
          }}
        >
          <svg
            ref={svg}
            viewBox={`${0.5 - 0.62 / zoom} ${0.5 - 0.62 / zoom} ${1.24 / zoom} ${1.24 / zoom}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ aspectRatio: `1/${ratio}` }}
            aria-label={`${labels[d.kind]}轮廓编辑器`}
            onPointerDown={(e) => {
              if (mode === "draw") {
                const p = at(e);
                setDraft((points) => [...points, p]);
                return;
              }
              setSelected(null);
            }}
            onPointerMove={(e) => {
              const g = drag.current;
              if (!g) return;
              const p = at(e);
              const points = g.points.map((v, i) =>
                g.edge && (i === g.v || i === (g.v + 1) % g.points.length)
                  ? ([
                      v[0] + p[0] - g.start[0],
                      v[1] + p[1] - g.start[1],
                    ] as Point)
                  : !g.edge && i === g.v
                    ? p
                    : v,
              );
              changeContour(g.c, { points });
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            <defs>
              <pattern
                id={`grid-${index}`}
                width=".1"
                height=".1"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M .1 0 L 0 0 0 .1"
                  fill="none"
                  stroke="#dce3ed"
                  strokeWidth=".002"
                />
              </pattern>
            </defs>
            <rect
              x="-10"
              y="-10"
              width="20"
              height="20"
              fill={`url(#grid-${index})`}
            />
            <path
              d="M 0 1 H 1.1 M 0 1 V -.1"
              fill="none"
              stroke="#a9b7ca"
              strokeWidth=".003"
            />
            <path
              d={d.contours
                .filter((c) => c.closed && c.selected && c.role === "region")
                .map(
                  (c) =>
                    c.points
                      .map((p, i) => `${i ? "L" : "M"} ${p[0]} ${1 - p[1]}`)
                      .join(" ") + "Z",
                )
                .join(" ")}
              fill="#3479ed18"
              fillRule="evenodd"
              pointerEvents="none"
            />
            {d.contours.map((c, ci) => (
              <g
                key={c.id}
                opacity={c.selected || c.role !== "region" ? 1 : 0.3}
              >
                <path
                  d={`${c.points.map((p, i) => `${i ? "L" : "M"}${p[0]} ${1 - p[1]}`).join(" ")}${c.closed ? "Z" : ""}`}
                  fill="none"
                  stroke={
                    c.role === "region"
                      ? "#3978d1"
                      : c.role === "hidden"
                        ? "#c29338"
                        : "#a0aaba"
                  }
                  strokeWidth=".007"
                  strokeDasharray={
                    c.role !== "region" ? ".025 .015" : undefined
                  }
                  fillRule="evenodd"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelected([ci, 0]);
                  }}
                />
                {c.points.map((p, i) => (
                  <g key={i}>
                    {(i < c.points.length - 1 || c.closed) && (
                      <line
                        x1={p[0]}
                        y1={1 - p[1]}
                        x2={c.points[(i + 1) % c.points.length][0]}
                        y2={1 - c.points[(i + 1) % c.points.length][1]}
                        stroke="transparent"
                        strokeWidth=".035"
                        onPointerDown={(e) => {
                          if (mode !== "select") return;
                          e.stopPropagation();
                          svg.current!.setPointerCapture(e.pointerId);
                          drag.current = {
                            c: ci,
                            v: i,
                            edge: true,
                            start: at(e),
                            points: structuredClone(c.points),
                          };
                          setSelected([ci, i]);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          const points = [...c.points];
                          points.splice(i + 1, 0, at(e));
                          changeContour(ci, { points });
                        }}
                      />
                    )}
                    {selected?.[0] === ci && (
                      <circle
                        cx={p[0]}
                        cy={1 - p[1]}
                        r={selected[1] === i ? 0.014 : 0.009}
                        fill="white"
                        stroke="#3479ed"
                        strokeWidth=".004"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          svg.current!.setPointerCapture(e.pointerId);
                          drag.current = {
                            c: ci,
                            v: i,
                            start: at(e),
                            points: structuredClone(c.points),
                          };
                          setSelected([ci, i]);
                        }}
                      />
                    )}
                  </g>
                ))}
              </g>
            ))}
            {draft.length > 0 && (
              <polyline
                points={draft.map((p) => `${p[0]},${1 - p[1]}`).join(" ")}
                fill="none"
                stroke="#3479ed"
                strokeWidth=".008"
              />
            )}
          </svg>
          {!d.contours.length && draft.length === 0 && mode === "select" && (
            <div className="upload-prompt">
              <Upload size={25} />
              <strong>{loading ? "正在解析…" : "导入二维图纸"}</strong>
              <span>SVG · DXF · PNG · JPG</span>
              <button onClick={() => file.current?.click()}>选择文件</button>
            </div>
          )}
          <div className="drawing-tools">
            <button
              aria-label={`选择视图 ${index + 1} 顶点`}
              title="点选顶点，拖动线段；双击边插入顶点"
              className={mode === "select" ? "active" : ""}
              onClick={() => setMode("select")}
            >
              <MousePointer2 size={14} />
            </button>
            <button
              aria-label={`绘制视图 ${index + 1} 轮廓`}
              title="绘制新区域"
              className={mode === "draw" ? "active" : ""}
              onClick={() => {
                setMode("draw");
                setDraft([]);
              }}
            >
              <PenLine size={14} />
            </button>
            <button title="上传图纸" onClick={() => file.current?.click()}>
              <Upload size={14} />
            </button>
            <i />
            <button
              title="放大二维视图"
              onClick={() => setZoom(Math.min(4, zoom * 1.25))}
            >
              <Plus size={14} />
            </button>
            <button
              title="缩小二维视图"
              onClick={() => setZoom(Math.max(0.5, zoom / 1.25))}
            >
              <Minus size={14} />
            </button>
          </div>
        </div>
        <input
          ref={file}
          type="file"
          accept=".svg,.dxf,.png,.jpg,.jpeg"
          className="hidden"
          aria-label={`上传视图 ${index + 1}`}
          onChange={(e) => {
            if (e.target.files?.[0]) void upload(e.target.files[0]);
            e.target.value = "";
          }}
        />
        {loading && (
          <div className="recognition-loading">正在本地提取轮廓与读取尺寸…</div>
        )}
        <RecognitionPanel
          drawing={d}
          unit={unit}
          onChange={onChange}
          advanced={advanced}
          onAdvanced={() => {
            setAdvanced(!advanced);
            setShowSource(false);
          }}
          showSource={showSource}
          onSource={() => setShowSource(!showSource)}
          onUpload={() => file.current?.click()}
        />
        {mode === "draw" && (
          <div className="edit-strip">
            点按画布添加顶点{" "}
            <button disabled={draft.length < 3} onClick={finish}>
              闭合区域 ({draft.length})
            </button>
            <button
              onClick={() => {
                setDraft([]);
                setMode("select");
              }}
            >
              取消
            </button>
          </div>
        )}
        {selected && d.contours[selected[0]] && (
          <div className="edit-strip">
            <button
              title="删除选中顶点"
              onClick={() => {
                const c = d.contours[selected[0]];
                changeContour(selected[0], {
                  points: c.points.filter((_, i) => i !== selected[1]),
                });
                setSelected(null);
              }}
            >
              <Trash2 size={12} /> 顶点
            </button>
            <button
              onClick={() => {
                const c = d.contours[selected[0]],
                  points = [...c.points],
                  i = selected[1],
                  j = (i + 1) % points.length;
                points[j] = [points[j][0], points[i][1]];
                changeContour(selected[0], { points });
              }}
            >
              水平
            </button>
            <button
              onClick={() => {
                const c = d.contours[selected[0]],
                  points = [...c.points],
                  i = selected[1],
                  j = (i + 1) % points.length;
                points[j] = [points[i][0], points[j][1]];
                changeContour(selected[0], { points });
              }}
            >
              垂直
            </button>
          </div>
        )}
        {d.contours.length > 0 && (
          <details className="contour-list">
            <summary>
              {d.contours.length} 个轮廓 ·{" "}
              {
                d.contours.filter((c) => c.selected && c.role === "region")
                  .length
              }{" "}
              个已选区域<span>检查区域</span>
            </summary>
            {d.contours.map((c, i) => (
              <div key={c.id}>
                <input
                  type="checkbox"
                  aria-label={`视图 ${index + 1} 区域 ${i + 1}`}
                  checked={c.selected}
                  onChange={(e) =>
                    changeContour(i, { selected: e.target.checked })
                  }
                />
                <button
                  className="text-button"
                  onClick={() => setSelected([i, 0])}
                >
                  轮廓 {i + 1}
                </button>
                <select
                  aria-label={`轮廓 ${i + 1} 语义`}
                  value={c.role}
                  onChange={(e) =>
                    changeContour(i, {
                      role: e.target.value as Contour["role"],
                    })
                  }
                >
                  <option value="region">实体/内孔</option>
                  <option value="reference">参考线</option>
                  <option value="hidden">隐藏线</option>
                </select>
                {!c.closed && (
                  <button onClick={() => changeContour(i, { closed: true })}>
                    闭合
                  </button>
                )}
                <button
                  title="删除轮廓"
                  onClick={() =>
                    patch({ contours: d.contours.filter((_, k) => k !== i) })
                  }
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <p>嵌套区域按奇偶规则作为内孔。参考线与隐藏线不参与实体重建。</p>
          </details>
        )}
        <div className="dimension-row">
          <label>
            宽
            <input
              aria-label={`视图 ${index + 1} 宽度`}
              type="number"
              min=".01"
              step="1"
              value={d.width || ""}
              placeholder="实际宽度"
              onChange={(e) => {
                const width = +e.target.value;
                const a = d.analysis;
                if (
                  a &&
                  a.heightSource !== "dimension" &&
                  (d.height === 0 || a.heightSource === "scale")
                )
                  patch({
                    width,
                    height:
                      Math.round(
                        ((width * a.objectBox[3]) / a.objectBox[2]) * 1000,
                      ) / 1000,
                    analysis: {
                      ...a,
                      status: "review",
                      widthSource: "manual",
                      heightSource: "scale",
                    },
                  });
                else patch({ width });
              }}
            />
          </label>
          <span>×</span>
          <label>
            高
            <input
              aria-label={`视图 ${index + 1} 高度`}
              type="number"
              min=".01"
              step="1"
              value={d.height || ""}
              placeholder="实际高度"
              onChange={(e) => patch({ height: +e.target.value })}
            />
          </label>
        </div>
        <details className="calibration">
          <summary>
            <ScanLine size={13} /> 坐标与识别设置
          </summary>
          <div className="dimension-row">
            <label>
              水平偏移
              <input
                type="number"
                value={d.offset[0]}
                onChange={(e) =>
                  patch({ offset: [+e.target.value, d.offset[1]] })
                }
              />
            </label>
            <label>
              竖直偏移
              <input
                type="number"
                value={d.offset[1]}
                onChange={(e) =>
                  patch({ offset: [d.offset[0], +e.target.value] })
                }
              />
            </label>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={d.mirror}
              onChange={(e) => patch({ mirror: e.target.checked })}
            />{" "}
            水平镜像
          </label>
          <label className="threshold">
            位图阈值 {threshold}
            <input
              type="range"
              min="40"
              max="230"
              value={threshold}
              onChange={(e) => setThreshold(+e.target.value)}
            />
          </label>
          <small>
            阈值在重新上传位图时应用。尺寸为整个图纸轮廓边界的实际尺寸；原点为左下角，偏移沿视图正轴。
          </small>
          <button
            className="text-button"
            onClick={() =>
              patch({ contours: structuredClone(d.originalContours) })
            }
          >
            <Undo2 size={12} /> 恢复解析轮廓
          </button>
        </details>
        {d.sourceData &&
          /^data:image\/(png|jpeg|svg\+xml);base64,/.test(d.sourceData) && (
            <details className="source-preview">
              <summary>查看原图 · {d.sourceName}</summary>
              <img src={d.sourceData} alt={`${labels[d.kind]}原始图纸`} />
            </details>
          )}
        {d.warnings.length > 0 && (
          <details className="parse-warnings">
            <summary>解析提示 · 请检查</summary>
            {d.warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </details>
        )}
        <button
          className={`confirm-button ${d.confirmed ? "confirmed" : ""}`}
          disabled={
            !!d.analysis?.dimensionConflict ||
            d.width <= 0 ||
            d.height <= 0 ||
            !!d.analysis?.alternatives.length ||
            !d.contours.some((c) => c.selected && c.role === "region") ||
            loading
          }
          onClick={() => onChange({ ...d, confirmed: !d.confirmed })}
        >
          <Check size={14} />
          {d.confirmed ? "轮廓与尺寸已确认" : "确认轮廓与尺寸"}
        </button>
      </fieldset>
    </section>
  );
}
