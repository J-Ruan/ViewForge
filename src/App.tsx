import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Download,
  FilePlus2,
  FolderOpen,
  History,
  Layers3,
  LoaderCircle,
  Plus,
  Redo2,
  Save,
  ShieldCheck,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Viewer } from "./components/Viewer";
import { DrawingEditor } from "./components/DrawingEditor";
import { FeatureForm } from "./components/FeatureForm";
import { blankProject, example, exampleNames } from "./examples";
import {
  deserialize,
  download,
  loadProject,
  saveProject,
  serialize,
} from "./io/project";
import { exportGlb, exportStl } from "./io/export";
import type { Feature, ModelResult, Project } from "./types";
import { labels } from "./types";
function App() {
  const [timeline, setTimeline] = useState<{
    past: Project[];
    current: Project;
    future: Project[];
  }>({ past: [], current: example(2), future: [] });
  const project = timeline.current;
  const [model, setModel] = useState<ModelResult | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [tab, setTab] = useState("model"),
    [modal, setModal] = useState<"examples" | "open" | "help" | "new" | null>(
      null,
    ),
    [feature, setFeature] = useState<Feature | null | undefined>(undefined),
    [exportMenu, setExportMenu] = useState(false),
    [generation, setGeneration] = useState(1),
    [validation, setValidation] = useState(false);
  const file = useRef<HTMLInputElement>(null),
    auto = useRef(true),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = (text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  };
  const update = (p: Project | ((current: Project) => Project)) =>
    setTimeline((t) => ({
      past: [...t.past.slice(-49), t.current],
      current: typeof p === "function" ? p(t.current) : p,
      future: [],
    }));
  const replace = (p: Project) => {
    auto.current = p.views.every((v) => v.confirmed);
    setTimeline({ past: [], current: p, future: [] });
    setModel(null);
    setError("");
    setModal(null);
    setGeneration((g) => g + 1);
  };
  const undo = () =>
    setTimeline((t) =>
      !t.past.length
        ? t
        : {
            past: t.past.slice(0, -1),
            current: t.past.at(-1)!,
            future: [t.current, ...t.future],
          },
    );
  const redo = () =>
    setTimeline((t) =>
      !t.future.length
        ? t
        : {
            past: [...t.past, t.current],
            current: t.future[0],
            future: t.future.slice(1),
          },
    );
  useEffect(() => {
    setModel(null);
    setError("");
    if (!auto.current) {
      setBusy(false);
      return;
    }
    if (project.views.some((v) => !v.confirmed)) {
      setBusy(false);
      return;
    }
    setBusy(true);
    let worker: Worker | undefined;
    const timer = setTimeout(() => {
      worker = new Worker(new URL("./geometry/worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (e) => {
        setBusy(false);
        if (e.data.error) setError(e.data.error);
        else setModel(e.data.result);
        worker?.terminate();
        clearTimeout(timeout);
      };
      worker.onerror = () => {
        setBusy(false);
        setError(
          "几何 Worker 加载失败，请检查本地 WebAssembly 文件是否可访问。",
        );
        clearTimeout(timeout);
        worker?.terminate();
      };
      worker.postMessage({ id: generation, project });
    }, 120);
    const timeout = setTimeout(() => {
      worker?.terminate();
      setBusy(false);
      setError("计算超过 30 秒，已停止。请简化轮廓后重试。");
    }, 30000);
    return () => {
      clearTimeout(timer);
      clearTimeout(timeout);
      worker?.terminate();
    };
  }, [project, generation]);
  const save = async () => {
    try {
      await saveProject(project);
      notify("项目已保存到此浏览器");
    } catch {
      setError("浏览器存储不可用，请导出 JSON 项目文件保存。");
    }
  };
  const openLocal = async () => {
    try {
      const p = await loadProject();
      if (p) {
        replace(p);
        notify("已恢复本地项目");
      } else notify("此浏览器还没有保存的项目");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const exportFile = async (type: "json" | "stl" | "glb") => {
    setExportMenu(false);
    const name =
      project.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") || "ViewForge";
    try {
      if (type === "json")
        download(
          serialize(project),
          `${name}.viewforge.json`,
          "application/json",
        );
      else if (model) {
        if (type === "stl") {
          if (
            !window.confirm(
              "STL 不携带单位。ViewForge 将以毫米（mm）导出；请在切片或 CAD 软件中按 mm 导入。",
            )
          )
            return;
          const stl = exportStl(model);
          download(stl.buffer as ArrayBuffer, `${name}.stl`);
        } else download(await exportGlb(model), `${name}.glb`);
      }
    } catch (e) {
      setError(`导出失败：${(e as Error).message}`);
    }
  };
  const changed = timeline.past.length > 0;
  return (
    <div className="app">
      <header className="app-header">
        <a className="brand" href="#" aria-label="ViewForge 首页">
          <span className="brand-icon">
            <Box size={23} strokeWidth={1.7} />
          </span>
          <strong>
            ViewForge<span>视图工坊</span>
          </strong>
          <span className="beta">BETA</span>
        </a>
        <div className="header-divider" />
        <span className="project-title">
          {project.name}
          {changed && <span className="unsaved-dot" />}
        </span>
        <nav>
          <button aria-label="新建" onClick={() => setModal("new")}>
            <FilePlus2 size={16} />
            <span>新建</span>
          </button>
          <button aria-label="打开" onClick={() => setModal("open")}>
            <FolderOpen size={16} />
            <span>打开</span>
          </button>
          <button aria-label="保存" onClick={() => void save()}>
            <Save size={16} />
            <span>保存</span>
          </button>
          <i />
          <button
            aria-label="撤销"
            title="撤销"
            disabled={!timeline.past.length}
            onClick={undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            aria-label="重做"
            title="重做"
            disabled={!timeline.future.length}
            onClick={redo}
          >
            <Redo2 size={17} />
          </button>
          <i />
          <div className="export-wrap">
            <button
              aria-label="导出"
              className="export-button"
              onClick={() => setExportMenu(!exportMenu)}
            >
              <Download size={15} />
              <span>导出</span>
              <ChevronDown size={12} />
            </button>
            {exportMenu && (
              <div className="dropdown">
                {(["json", "stl", "glb"] as const).map((v) => (
                  <button
                    disabled={v !== "json" && !model}
                    key={v}
                    onClick={() => void exportFile(v)}
                  >
                    {v === "json"
                      ? "JSON 项目文件"
                      : v === "stl"
                        ? "STL 模型 · mm"
                        : "GLB 模型 · m / Y-up"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button aria-label="使用帮助" onClick={() => setModal("help")}>
            <CircleHelp size={19} />
          </button>
        </nav>
      </header>
      <div className="workspace-bar">
        <div>
          <span className="workspace-label">建模工作台</span>
          <ChevronRight size={13} />
          <span>双视图重建</span>
        </div>
        <button onClick={() => setModal("examples")}>
          <Layers3 size={14} /> 示例项目 <ArrowUpRight size={13} />
        </button>
        <span className="local-badge">
          <ShieldCheck size={13} /> 本地计算 · 无 AI · 无需上传云端
        </span>
      </div>
      <div className={`workbench mobile-${tab}`}>
        <aside className="drawings-panel">
          <div className="panel-heading">
            <h2>
              二维视图 <span>2</span>
            </h2>
            <span className="tiny">正交投影约束</span>
          </div>
          <div className="drawings-scroll">
            {project.views.map((d, i) => (
              <DrawingEditor
                key={i}
                index={i}
                drawing={d}
                onError={setError}
                onChange={(v) => {
                  update((current) => {
                    const views = [...current.views] as Project["views"];
                    views[i] = typeof v === "function" ? v(views[i]) : v;
                    return { ...current, views };
                  });
                }}
              />
            ))}
            <div className="input-tip">
              <ShieldCheck size={15} />
              <p>
                图纸仅保存在你的设备中。
                <br />
                尺寸线与隐藏线请标记为参考信息。
              </p>
            </div>
          </div>
          <div className="generate-area">
            <button
              className="primary"
              disabled={busy || project.views.some((v) => !v.confirmed)}
              onClick={() => {
                auto.current = true;
                setGeneration((g) => g + 1);
                setTab("model");
              }}
            >
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Box size={17} />
              )}{" "}
              {busy ? "正在计算…" : "生成 3D 模型"}{" "}
              {!busy && <ChevronRight size={15} />}
            </button>
            <small>基于轮廓反投影与布尔交集</small>
          </div>
        </aside>
        <main className="model-panel">
          <Viewer model={model} busy={busy} />
          <div className="model-bottom">
            <div>
              <span className="eyebrow">ORTHOGRAPHIC RECONSTRUCTION</span>
              <h1>让二维视图，拥有三维表达。</h1>
              <p>两个视图的几何交集，构建符合轮廓约束的候选实体。</p>
            </div>
            <div className="candidate-badge">
              <Box size={21} />
              <span>
                候选模型<small>隐藏结构未确定</small>
              </span>
            </div>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <strong>需要检查</strong>
              <span>{error}</span>
              <button aria-label="关闭错误" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
        </main>
        <aside className="properties-panel">
          <div className="panel-heading">
            <h2>模型属性</h2>
            <span className={`pill ${model ? "ok" : ""}`}>
              {busy ? "计算中" : model ? "已生成" : "待生成"}
            </span>
          </div>
          <div className="properties-scroll">
            <section className="property-section">
              <h3>项目设置</h3>
              <label className="setting">
                项目名称
                <input
                  aria-label="项目名称"
                  value={project.name}
                  maxLength={80}
                  onChange={(e) => update({ ...project, name: e.target.value })}
                />
              </label>
              <label className="setting">
                长度单位
                <select
                  aria-label="长度单位"
                  value={project.unit}
                  onChange={(e) =>
                    update({
                      ...project,
                      unit: e.target.value as Project["unit"],
                      views: project.views.map((v) => ({
                        ...v,
                        confirmed: false,
                      })) as Project["views"],
                    })
                  }
                >
                  <option value="mm">毫米 · mm</option>
                  <option value="cm">厘米 · cm</option>
                </select>
              </label>
              <label className="setting">
                投影方式
                <select
                  aria-label="投影方式"
                  value={project.projection}
                  onChange={(e) =>
                    update({
                      ...project,
                      projection: e.target.value as Project["projection"],
                    })
                  }
                >
                  <option value="third">第三角法</option>
                  <option value="first">第一角法</option>
                </select>
              </label>
              <label className="setting">
                侧视方向
                <select
                  aria-label="侧视方向"
                  value={project.side}
                  onChange={(e) =>
                    update({
                      ...project,
                      side: e.target.value as Project["side"],
                      views: project.views.map((v) =>
                        v.kind === "side" ? { ...v, confirmed: false } : v,
                      ) as Project["views"],
                    })
                  }
                >
                  <option value="right">右侧视图</option>
                  <option value="left">左侧视图</option>
                </select>
              </label>
              <small>
                角法决定图纸排布；已标识的视图独立输入，无需旋转。左侧视图自动反转
                Y，可用镜像额外修正。
              </small>
            </section>
            <section className="property-section">
              <h3>
                实体尺寸 <span>mm</span>
              </h3>
              <div className="size-grid">
                {["X · 宽度", "Y · 深度", "Z · 高度"].map((v, i) => (
                  <div key={v}>
                    <span>{v}</span>
                    <strong data-testid={`dimension-${i}`}>
                      {model
                        ? (model.bounds.max[i] - model.bounds.min[i]).toFixed(1)
                        : "—"}
                    </strong>
                  </div>
                ))}
              </div>
              <div className="volume">
                体积{" "}
                <span data-testid="volume">
                  {model
                    ? `${model.volume.toLocaleString(undefined, { maximumFractionDigits: 1 })} mm³`
                    : "—"}
                </span>
              </div>
            </section>
            <section className="property-section">
              <h3>
                几何特征 <span>{project.features.length} 个</span>
              </h3>
              {project.features.length === 0 ? (
                <div className="no-features">
                  <Layers3 size={20} />
                  <span>尚未添加切除特征</span>
                </div>
              ) : (
                project.features.map((f, i) => (
                  <div className="feature-row" key={f.id}>
                    <button onClick={() => setFeature(f)}>
                      <Box size={15} />
                      <span>
                        {
                          {
                            circle: "圆孔",
                            rectangle: "矩形孔",
                            groove: "矩形凹槽",
                            cut: "基础切除",
                          }[f.type]
                        }{" "}
                        {i + 1}
                        <small>
                          +{f.axis.toUpperCase()} · 深 {f.depth} mm
                        </small>
                      </span>
                    </button>
                    <button
                      aria-label={`删除特征 ${i + 1}`}
                      onClick={() =>
                        update({
                          ...project,
                          features: project.features.filter(
                            (x) => x.id !== f.id,
                          ),
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
              <button
                className="outline wide"
                disabled={!model}
                onClick={() => setFeature(null)}
              >
                <Plus size={15} /> 添加切除特征
              </button>
            </section>
            <section className="property-section">
              <h3>
                投影验证 <span className="pill">精确面积 IoU</span>
              </h3>
              {project.views.map((v, i) => {
                const c = model?.checks[i],
                  ok = c && c.iou >= 0.999;
                return (
                  <div className="check-row" key={i}>
                    <span>{labels[v.kind]}</span>
                    <span className={ok ? "good" : "muted"}>
                      {c ? `${(c.iou * 100).toFixed(2)}%` : "待验证"}{" "}
                      {ok && <Check size={13} />}
                    </span>
                  </div>
                );
              })}
              <button
                className="validation-button"
                disabled={!model}
                onClick={() => setValidation(true)}
              >
                查看投影叠加 <ArrowUpRight size={14} />
              </button>
              <div className="uncertain">
                <span /> 内部棱边、隐藏线及真实内部结构尚未验证
              </div>
            </section>
            <div className="limit-note">
              <CircleHelp size={17} />
              <div>
                <strong>两个视图 ≠ 唯一形状</strong>
                <p>{project.note}</p>
              </div>
            </div>
          </div>
          <footer className="properties-footer">
            <span className="dot" /> Manifold 几何内核 <span>WASM</span>
          </footer>
        </aside>
      </div>
      <footer className="statusbar">
        <span>
          <span className="dot" /> 所有计算均在浏览器本地执行
        </span>
        <span>
          世界坐标 · X 宽 / Y 深 / Z 高 <i /> ViewForge 0.1
        </span>
      </footer>
      <nav className="mobile-tabs">
        {[
          ["drawings", "二维视图"],
          ["model", "三维模型"],
          ["properties", "模型属性"],
        ].map(([k, v]) => (
          <button
            className={tab === k ? "active" : ""}
            onClick={() => setTab(k)}
            key={k}
          >
            {v}
          </button>
        ))}
      </nav>
      {error && (
        <div className="error-banner mobile-error" role="alert">
          <strong>需要检查</strong>
          <span>{error}</span>
          <button aria-label="关闭错误" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      <input
        className="hidden"
        ref={file}
        type="file"
        accept=".json"
        aria-label="打开项目文件"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            if (f.size > 36 * 1024 * 1024) throw new Error("项目超过 36 MB。");
            replace(deserialize(await f.text()));
            notify("项目已打开");
          } catch (e) {
            setError((e as Error).message);
          }
          e.target.value = "";
        }}
      />
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={
              {
                examples: "示例项目",
                open: "打开项目",
                help: "使用帮助",
                new: "新建项目",
              }[modal]
            }
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">VIEWFORGE / WORKSPACE</span>
                <h2>
                  {
                    {
                      examples: "从一个几何示例开始",
                      open: "打开项目",
                      help: "关于轮廓重建",
                      new: "新建项目",
                    }[modal]
                  }
                </h2>
              </div>
              <button aria-label="关闭对话框" onClick={() => setModal(null)}>
                <X size={20} />
              </button>
            </header>
            {modal === "examples" && (
              <>
                <p className="muted">
                  每个示例均通过同一重建引擎实时生成。打开前请保存当前项目。
                </p>
                <div className="examples-grid">
                  {exampleNames.map((v, i) => (
                    <button key={v} onClick={() => replace(example(i))}>
                      <Box size={23} />
                      <span>
                        0{i + 1}
                        <strong>{v}</strong>
                      </span>
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
                </div>
              </>
            )}
            {modal === "open" && (
              <>
                <p className="muted">
                  请先保存当前工作。所有文件均在本地读取。
                </p>
                <button
                  className="open-choice"
                  onClick={() => file.current?.click()}
                >
                  <FolderOpen />
                  <span>
                    选择 JSON 项目文件
                    <small>恢复原始图纸、轮廓与特征参数</small>
                  </span>
                  <ChevronRight />
                </button>
                <button
                  className="open-choice"
                  onClick={() => void openLocal()}
                >
                  <History />
                  <span>
                    恢复浏览器保存的项目
                    <small>读取此设备 IndexedDB 中最近一次保存</small>
                  </span>
                  <ChevronRight />
                </button>
              </>
            )}
            {modal === "new" && (
              <>
                <p className="muted">
                  建立空白项目，上传两个不同的标准视图。当前未保存的工作将被替换。
                </p>
                <button
                  className="primary wide"
                  onClick={() => {
                    replace(blankProject());
                    setTab("drawings");
                  }}
                >
                  创建空白项目
                </button>
                <button
                  className="outline wide"
                  onClick={() => setModal("examples")}
                >
                  或从教学示例开始
                </button>
              </>
            )}
            {modal === "help" && (
              <div className="help-content">
                <p>
                  <strong>01 / 输入与校准</strong>
                  上传两个视图，检查区域与内孔，移除尺寸线。尺寸以归一化图纸边界为基准；必要时设置偏移、镜像与侧视方向，然后分别确认。
                </p>
                <p>
                  <strong>02 / 编辑轮廓</strong>
                  点选轮廓后拖动顶点或线段，双击边添加顶点。“画笔”手动补绘区域；水平、垂直按钮修正选中顶点之后的边。位图识别的区域默认不选中，必须检查后勾选。
                </p>
                <p>
                  <strong>03 / 生成与修正</strong>
                  沿法线拉伸两个平面区域，再求布尔交集。交集必须完整投影回输入轮廓，否则停止生成。特征切除只由用户定义。
                </p>
                <p>
                  <strong>04 / 检查与导出</strong>IoU
                  为轮廓面积交并比，不代表真实正确率。切除若改变投影，将显示红色缺失区域。STL
                  按 mm 导出，GLB 转为 m / Y-up。
                </p>
                <div className="notice">
                  两个轮廓通常无法确定隐藏结构。此版本不验证内部可见棱边、隐藏线，也不接受第三视图约束。不要把候选实体直接用于未经工程审查的制造。
                </div>
              </div>
            )}
          </section>
        </div>
      )}
      {feature !== undefined && (
        <FeatureForm
          initial={feature || undefined}
          onClose={() => setFeature(undefined)}
          onSave={(f) =>
            update({
              ...project,
              features: project.features.some((x) => x.id === f.id)
                ? project.features.map((x) => (x.id === f.id ? f : x))
                : [...project.features, f],
            })
          }
        />
      )}
      {validation && model && (
        <div className="modal-backdrop" onClick={() => setValidation(false)}>
          <section
            className="modal validation-modal"
            role="dialog"
            aria-modal="true"
            aria-label="投影叠加"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">PROJECTION CHECK</span>
                <h2>投影约束，不等于内部结构</h2>
              </div>
              <button
                aria-label="关闭投影叠加"
                onClick={() => setValidation(false)}
              >
                <X />
              </button>
            </header>
            <div className="projection-grid">
              {model.checks.map((c) => {
                const p = c.input.flat(),
                  minX = Math.min(...p.map((p) => p[0])),
                  minY = Math.min(...p.map((p) => p[1])),
                  w = Math.max(...p.map((p) => p[0])) - minX,
                  h = Math.max(...p.map((p) => p[1])) - minY;
                const path = (rings: typeof c.input) =>
                  rings
                    .map(
                      (r) =>
                        r
                          .map((v, i) => `${i ? "L" : "M"} ${v[0]} ${-v[1]}`)
                          .join(" ") + "Z",
                    )
                    .join(" ");
                return (
                  <div key={c.kind}>
                    <h3>
                      {labels[c.kind]}
                      <span className={c.iou >= 0.999 ? "good" : "bad"}>
                        {(c.iou * 100).toFixed(2)}% IoU
                      </span>
                    </h3>
                    <svg
                      viewBox={`${minX - w * 0.12} ${-minY - h * 1.12} ${w * 1.24} ${h * 1.24}`}
                    >
                      <path
                        d={path(c.projected)}
                        fill="#60a5fa35"
                        fillRule="evenodd"
                      />
                      <path
                        d={path(c.input)}
                        fill="none"
                        stroke="#3480e8"
                        strokeWidth={w * 0.008}
                        fillRule="evenodd"
                      />
                      <path
                        d={path(c.missing)}
                        fill="#ed6e6e99"
                        fillRule="evenodd"
                      />
                      <path
                        d={path(c.extra)}
                        fill="#f4b34d99"
                        fillRule="evenodd"
                      />
                    </svg>
                  </div>
                );
              })}
            </div>
            <p className="projection-legend">
              <span>蓝：输入 / 模型投影</span>
              <span>红：缺失</span>
              <span>橙：多出</span>
            </p>
            <div className="notice">
              基础候选已满足两个投影约束（生成门槛 IoU ≥
              99.9%）。当前结果包含人工特征。内部棱边、隐藏线与不确定结构均未验证。
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
export default App;
