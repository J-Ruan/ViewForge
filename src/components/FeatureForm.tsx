import { useState } from "react";
import { X } from "lucide-react";
import type { Feature } from "../types";
import { uid } from "../types";
export function FeatureForm({
  initial,
  onSave,
  onClose,
}: {
  initial?: Feature;
  onSave: (f: Feature) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<Feature>(
    initial || {
      id: uid(),
      type: "circle",
      axis: "z",
      position: [40, 25, 0],
      radius: 6,
      width: 20,
      height: 15,
      depth: 60,
    },
  );
  const patch = (p: Partial<Feature>) => setF({ ...f, ...p });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="切除特征"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">EXPLICIT GEOMETRY</span>
            <h2>{initial ? "编辑" : "添加"}切除特征</h2>
          </div>
          <button aria-label="关闭特征编辑" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(f);
            onClose();
          }}
        >
          <p className="muted">
            特征由你指定，沿选定的正轴方向切除。所有位置与尺寸均为 mm。
          </p>
          <div className="form-grid">
            <label>
              类型
              <select
                aria-label="特征类型"
                value={f.type}
                onChange={(e) =>
                  patch({ type: e.target.value as Feature["type"] })
                }
              >
                <option value="circle">圆孔</option>
                <option value="rectangle">矩形孔</option>
                <option value="groove">矩形凹槽</option>
                <option value="cut">基础块切除</option>
              </select>
            </label>
            <label>
              切除方向
              <select
                aria-label="切除方向"
                value={f.axis}
                onChange={(e) =>
                  patch({ axis: e.target.value as Feature["axis"] })
                }
              >
                <option value="x">+X · 宽度</option>
                <option value="y">+Y · 深度</option>
                <option value="z">+Z · 高度</option>
              </select>
            </label>
          </div>
          <div className="form-grid three">
            {["X", "Y", "Z"].map((a, i) => (
              <label key={a}>
                起点 {a}
                <input
                  aria-label={`特征起点 ${a}`}
                  required
                  type="number"
                  step="any"
                  min="-10000"
                  max="10000"
                  value={f.position[i]}
                  onChange={(e) =>
                    patch({
                      position: f.position.map((v, j) =>
                        j === i ? +e.target.value : v,
                      ) as Feature["position"],
                    })
                  }
                />
              </label>
            ))}
          </div>
          <div className="form-grid">
            {(f.type === "circle"
              ? ["radius", "depth"]
              : ["width", "height", "depth"]
            ).map((k) => (
              <label key={k}>
                {
                  {
                    radius: "半径",
                    width: "截面宽",
                    height: "截面高",
                    depth: "切除深度",
                  }[k]
                }
                <input
                  aria-label={
                    {
                      radius: "半径",
                      width: "截面宽",
                      height: "截面高",
                      depth: "切除深度",
                    }[k]
                  }
                  required
                  type="number"
                  min=".01"
                  max="20000"
                  step="any"
                  value={f[k as "radius"]}
                  onChange={(e) => patch({ [k]: +e.target.value })}
                />
              </label>
            ))}
          </div>
          <div className="notice">
            圆孔起点为底面圆心；矩形起点为底面左下角。截面坐标：+X → YZ，+Y →
            XZ，+Z → XY。贯穿孔的深度应覆盖整个实体。
          </div>
          <button className="primary wide" type="submit">
            应用布尔切除
          </button>
        </form>
      </section>
    </div>
  );
}
