# ViewForge · 视图工坊

[在线使用](https://j-ruan.github.io/ViewForge/) · [部署工作流](https://github.com/J-Ruan/ViewForge/actions)

在浏览器本地，将两个标准二维正投影视图转换为三维**候选实体**。纯计算几何，无 AI、无账户、无后端、无图纸上传服务。React / TypeScript / Three.js / Manifold WebAssembly。

> 两视图通常不能唯一确定三维形状。重投影轮廓匹配只说明满足这些轮廓约束，不证明内部结构正确。

## 本地运行

需要 Node.js ≥ 22.12（推荐 Node 24），支持 WebAssembly 的现代浏览器。3D 查看需 WebGL；WebGL 不可用时仍可计算与导出。

```sh
npm ci
npm run dev
```

默认端口 5173。离线使用须先完成依赖安装与资源加载；没有服务工作线程，不承诺首次访问即可离线启动。

```sh
npm test                   # 真实 Manifold WASM 几何与解析测试
npm run typecheck
npx playwright install chromium
npm run test:e2e            # 桌面 Chrome + Pixel 7 Chromium 模拟
npm run build
npm run preview
```

如果机器已有 Chromium，可运行 `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`。测试使用 SwiftShader 软件 WebGL；安卓模拟不等于真机 GPU 验收。

## 操作

1. 新建项目，选择正视（XZ）、俯视（XY）、侧视（YZ）中的两个不同视图，上传带尺寸标注的 PNG/JPG/SVG/基础二维 DXF。清晰单视图不必预先删除标题、尺寸线或数字。
2. 默认展示自动提取的**净轮廓**。位图通过封闭区域分割识别主体，而非把每个黑色字形列成实体；外部标题、箭头与标注不参与重建。存在多个近似大小的区域时会要求选择，不伪称已确定。
3. 自动读取常见印刷数字，关联尺寸线与界线，检查总尺寸和分段尺寸链。SVG 优先直接读取文字，DXF 优先读取原生线性 DIMENSION。读取可靠时直接给出宽高；缺少一个方向标注时明确提示按同一扫描比例换算。没有可靠尺寸时不沿用旧项目的 80 × 60 默认值：输入实际宽度可等比补足高度，也可手动修改。
4. 核对尺寸和单位，分别点击“确认轮廓与尺寸”。“原图与识别依据”显示零件边界和关联读数；“查看与修正”可改错数字或取消采用某条标注。尺寸链矛盾时禁止确认，不偷偷平均成一个看似合理的值。
5. 点击生成。真实公共轴冲突会列明两幅视图的坐标范围。微小扫描误差按像素边界容差检查，并保留实际 IoU 和提示；较大的冲突仍停止生成。
6. 只有需要修轮廓时才打开“高级编辑”：补绘、拖点/拖边、双击边插点、删除、水平/垂直对齐，以及内孔/参考线标记。不会从不可唯一解释的内部像素线自动推断隐藏孔深。
7. 添加圆孔、矩形孔、凹槽或块切除，明确指定正轴、起点和深度。所有特征参数用 mm。投影叠加展示真实缺失/多出区域。
8. 保存到 IndexedDB，或导出 JSON。识别原图、数字读数、尺寸关联、原始/编辑轮廓和标定均保存；STL 为 **mm**，GLB 为 **m、Y-up**。

公开的[带标注阶梯图](public/examples/annotated-step.svg)和[带标注俯视图](public/examples/annotated-top.svg)可用于试用。测试会将其渲染为 PNG/JPG，再走与上传相同的识别、校准与真实三维重建流程。

## 输入范围

- SVG：原始矢量路径，支持路径、矩形、多边形、折线、圆/椭圆、线；曲线折线化。不接受脚本、外部资源、样式表、use 引用。请将文字转路径或删除标注，将引用展开。
- DXF：ASCII LINE、平面 LWPOLYLINE/POLYLINE（包括 bulge 弧）、CIRCLE、ARC。连接端点以形成轮廓。SPLINE、INSERT 等不支持的几何实体明确报错；TEXT/MTEXT 作为标注分离，支持水平/垂直线性 DIMENSION 的自动标定。只接受世界 XY 平面，不支持 OCS 变换和三维实体。DXF 的 `$INSUNITS` 不自动标定。
- PNG/JPG：灰度/阈值 → 封闭区域连通分量 → 零件边界与线宽中心校正 → 折线简化；数字使用多字体模板、拓扑和形状距离匹配，再与尺寸线/界线关联。没有神经网络、预训练 OCR 模型或外部识图 API。不是通用工程图理解；不识别手写数字，不推断隐藏孔。
- 文件 ≤12 MB；位图 ≤2400 万像素，处理长边 ≤1536 px。最多 64 个参与区域、总计 4000 顶点、单环 1500 顶点、64 个切除特征。尺寸 ≤10000 mm。导入之后仍须确认语义与标定。

## 坐标与算法

X=宽度，Y=深度，Z=高度。正视从 -Y 看向 +Y（右=X、上=Z）；俯视从 +Z 看向 -Z（右=X、上=Y）；右侧从 +X 看向 -X（右=Y、上=Z）。左侧视图将水平坐标反转到 +Y。用户镜像为额外修正。第一/第三角法只影响整张图纸视图排布，独立标识后的视图使用同一个世界坐标，不会再按角法偷偷镜像。

每个二维闭合区域转换为 `CrossSection(EvenOdd)`，沿未约束轴拉伸覆盖另一视图给定范围，然后 `Manifold.intersect` 求交。模型是输入轮廓反投影的最大公共实体（visual hull）；使用 `subtract` 显式切除人工特征。通过 `Manifold.project` 求实际二维投影并做区域布尔交/并，得到面积 IoU，而非采样像素分数。所有三维运算在 Worker 中完成，释放每个 WASM 对象；更新/超时终止 Worker，旧结果不会覆盖新项目。

识图细节见 [自动识别与尺寸校准](docs/RECOGNITION.md)。详见 [算法](docs/ALGORITHM.md)、[架构](docs/ARCHITECTURE.md)、[局限](docs/LIMITATIONS.md)。

## GitHub Pages

已提供 `.github/workflows/pages.yml`：安装 → 类型检查 → 单元/几何测试 → 桌面/安卓模拟 E2E → 生产构建 → Pages 部署。仓库默认分支使用 `main`。仓库 Settings → Pages 的 Source 需为 **GitHub Actions**，账号需具有 Pages 权限。推送 `main` 或手动运行工作流触发。

CI 将 `VITE_BASE_PATH=/<仓库名>/`，所以 JS、Worker 和 WASM 会部署到同一子路径。自定义域名根目录可设为 `/`。本站没有路径路由，刷新不会请求不存在的子页面。不要直接用 file:// 打开 dist；用静态 HTTP 服务。

`npm run build` 自动收集生产依赖许可证到 `public/licenses/THIRD-PARTY-NOTICES.txt`，并随站点发布。Manifold 为 Apache-2.0，其余应用主要依赖为 MIT/ISC；本项目源代码 MIT，不重新许可第三方代码。未使用 OpenCV，位图采用自有传统处理算法。

## 后续方向

第三视图约束、内部棱边与隐藏线验证、亚像素曲线拟合、复杂 DXF 图层/OCS 支持、多项目列表、真机交互与辅助技术验收。当前不生成工程级参数化 B-rep / STEP。

与 Pages 相同子路径的生产端到端检查：

```sh
VITE_BASE_PATH=/ViewForge/ npm run build
TEST_BASE_PATH=/ViewForge/ PLAYWRIGHT_PREVIEW=1 npm run test:e2e
```

测试配置会令预览服务器使用相同 base；本地系统 Chromium 仍可加 `CHROMIUM_PATH=/usr/bin/chromium`。
