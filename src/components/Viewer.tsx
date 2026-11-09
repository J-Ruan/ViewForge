import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Expand, Grid3X3, Layers, Move3D, RotateCcw } from "lucide-react";
import { meshGeometry } from "../io/export";
import type { ModelResult } from "../types";
const cameras: Record<string, number[]> = {
  等轴: [1, -1, 0.8],
  正视: [0, -1, 0],
  后视: [0, 1, 0],
  左视: [-1, 0, 0],
  右视: [1, 0, 0],
  俯视: [0, 0, 1],
  仰视: [0, 0, -1],
};
export function Viewer({
  model,
  busy,
}: {
  model: ModelResult | null;
  busy: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    setCamera = useRef<(name: string) => void>(() => {});
  const [view, setView] = useState("等轴"),
    [wire, setWire] = useState(false),
    [grid, setGrid] = useState(true),
    [edges, setEdges] = useState(true),
    [opacity, setOpacity] = useState(1),
    [error, setError] = useState("");
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      setError("");
    } catch {
      setError("WebGL 不可用。请启用浏览器硬件加速；几何计算和导出仍可使用。");
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0xf4f6f9);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "可旋转的三维候选模型");
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100000);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8d9aaf, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(150, -150, 250);
    scene.add(light);
    const size = model
      ? new THREE.Vector3(
          ...(model.bounds.max as [number, number, number]),
        ).sub(
          new THREE.Vector3(...(model.bounds.min as [number, number, number])),
        )
      : new THREE.Vector3(80, 50, 60);
    const center = model
      ? new THREE.Vector3(
          ...(model.bounds.min as [number, number, number]),
        ).addScaledVector(size, 0.5)
      : new THREE.Vector3(40, 25, 30);
    const extent = Math.max(size.x, size.y, size.z, 1),
      gSize = 10 ** Math.ceil(Math.log10(extent * 3));
    const gridHelper = new THREE.GridHelper(gSize, 20, 0xcbd3e0, 0xe1e6ee);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.set(
      center.x,
      center.y,
      (model?.bounds.min[2] || 0) - extent * 0.002,
    );
    gridHelper.visible = grid;
    scene.add(gridHelper);
    const axes = new THREE.AxesHelper(extent * 0.35);
    axes.position.set(
      (model?.bounds.min[0] || 0) - extent * 0.15,
      (model?.bounds.min[1] || 0) - extent * 0.15,
      0,
    );
    scene.add(axes);
    let geometry: THREE.BufferGeometry | undefined,
      material: THREE.MeshStandardMaterial | undefined,
      edgeGeometry: THREE.EdgesGeometry | undefined,
      edgeMaterial: THREE.LineBasicMaterial | undefined;
    if (model) {
      geometry = meshGeometry(model);
      material = new THREE.MeshStandardMaterial({
        color: 0x8aa9c7,
        roughness: 0.48,
        metalness: 0.08,
        wireframe: wire,
        transparent: opacity < 1,
        opacity,
        flatShading: true,
      });
      scene.add(new THREE.Mesh(geometry, material));
      edgeGeometry = new THREE.EdgesGeometry(geometry, 25);
      edgeMaterial = new THREE.LineBasicMaterial({
        color: 0x3d5b7e,
        transparent: true,
        opacity: 0.6,
      });
      const lines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
      lines.visible = edges;
      scene.add(lines);
    }
    setCamera.current = (name) => {
      const v = cameras[name] || cameras["等轴"];
      controls.target.copy(center);
      camera.position
        .copy(center)
        .add(
          new THREE.Vector3(v[0], v[1], v[2])
            .normalize()
            .multiplyScalar(extent * 2.8),
        );
      camera.up.set(0, 0, 1);
      if (name === "俯视" || name === "仰视") camera.up.set(0, 1, 0);
      camera.near = extent / 10000;
      camera.far = extent * 100;
      camera.updateProjectionMatrix();
      controls.update();
    };
    setCamera.current(view);
    const resize = () => {
      const { width, height } = el.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
    return () => {
      observer.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      geometry?.dispose();
      material?.dispose();
      edgeGeometry?.dispose();
      edgeMaterial?.dispose();
      gridHelper.geometry.dispose();
      (gridHelper.material as THREE.Material).dispose();
      axes.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [model, wire, grid, opacity, edges]);
  return (
    <div className="viewer-shell">
      <div className="viewer-top">
        <span className="viewer-tag">
          <span className="dot" /> 三维候选实体
        </span>
        <select
          aria-label="观察方向"
          value={view}
          onChange={(e) => {
            setView(e.target.value);
            setCamera.current(e.target.value);
          }}
        >
          {Object.keys(cameras).map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </div>
      <div ref={host} className="three-host" />
      {(!model || error) && (
        <div className="viewer-empty">
          {error || (busy ? "正在计算几何交集…" : "从两个视图，构建一个可能。")}
          <small>{error ? "" : "上传并校准轮廓后生成三维候选实体"}</small>
        </div>
      )}
      <div className="axis-legend">
        <span className="x">X 宽度</span>
        <span className="y">Y 深度</span>
        <span className="z">Z 高度</span>
      </div>
      <div className="viewer-tools">
        <button
          title="居中并自适应"
          aria-label="模型居中"
          onClick={() => setCamera.current(view)}
        >
          <Expand size={17} />
        </button>
        <button
          title="等轴测视角"
          onClick={() => {
            setView("等轴");
            setCamera.current("等轴");
          }}
        >
          <RotateCcw size={17} />
        </button>
        <i />
        <button
          title="线框"
          className={wire ? "active" : ""}
          onClick={() => setWire(!wire)}
        >
          <Move3D size={17} />
        </button>
        <button
          title="模型边线"
          className={edges ? "active" : ""}
          onClick={() => setEdges(!edges)}
        >
          <Layers size={17} />
        </button>
        <button
          title="地面网格"
          className={grid ? "active" : ""}
          onClick={() => setGrid(!grid)}
        >
          <Grid3X3 size={17} />
        </button>
        <i />
        <input
          aria-label="模型透明度"
          title="透明度"
          type="range"
          min="0.15"
          max="1"
          step="0.05"
          value={opacity}
          onChange={(e) => setOpacity(+e.target.value)}
        />
      </div>
      <div className="viewer-foot">
        <span>拖动旋转 · 滚轮缩放 · 右键平移</span>
        <span>
          {model
            ? `${model.triangles.toLocaleString()} 个三角面`
            : "本地几何引擎"}
        </span>
      </div>
    </div>
  );
}
