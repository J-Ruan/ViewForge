# ViewForge · 视图工坊

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

1. 默认打开“阶梯体”教学项目，模型由两幅轮廓实时求交得到。也可新建空白项目。
2. 选择正视（XZ）、俯视（XY）、侧视（YZ）中的两个不同视图，上传 PNG/JPG/SVG/基础二维 DXF。
3. 检查轮廓。参考线和隐藏线不参与重建；嵌套的所选封闭区域按奇偶规则形成内孔。位图候选默认不选择，必须手动勾选。
4. 设定图纸几何边界的实际宽、高、单位与原点偏移。尺寸线也会影响解析边界，请预先裁剪，或在编辑后重新校准。画笔可补绘封闭区域；点选顶点可拖动、删除；拖边平移该边；双击边插入顶点；水平/垂直修正选中顶点后的边。
5. 确认两个视图后生成。若基础交集投影不能匹配输入（IoU < 99.9%），停止输出模型并提示校准。
6. 可添加、编辑、删除圆孔、矩形孔、凹槽或块切除，明确指定正轴、起点与深度。所有特征参数用 mm。撤销/重做覆盖几何与校准操作。
7. 投影叠加展示输入、模型投影、红色缺失、橙色多出区域。人工切除可能改变轮廓，校验如实显示差异。
8. 保存到 IndexedDB（此设备最近一次保存），或导出 JSON 项目。STL 坐标为 **mm**；GLB 转成 **m、Y-up**。JSON 保留原图、原始/编辑后轮廓、标定、投影设置及特征。

## 输入范围

- SVG：原始矢量路径，支持路径、矩形、多边形、折线、圆/椭圆、线；曲线折线化。不接受脚本、外部资源、样式表、use 引用。请将文字转路径或删除标注，将引用展开。
- DXF：ASCII LINE、平面 LWPOLYLINE/POLYLINE（包括 bulge 弧）、CIRCLE、ARC。连接端点以形成轮廓。SPLINE、INSERT、TEXT、DIMENSION 等明确报错，需先在 CAD 中展开/删除。只接受世界 XY 平面，不支持 OCS 变换和三维实体。DXF 的 `$INSUNITS` 不自动标定。
- PNG/JPG：灰度 → 阈值 → 孤立像素去噪 → 墨迹外边界追踪 → Douglas–Peucker 简化；这是传统算法，不是通用工程图理解。保留墨迹组件外边界，避免把线宽内侧错误识别成孔。曲线由折线逼近；不会识别尺寸数字或推断隐藏孔。
- 文件 ≤12 MB；位图 ≤2400 万像素，处理长边 ≤1024 px。最多 64 个参与区域、总计 4000 顶点、单环 1500 顶点、64 个切除特征。尺寸 ≤10000 mm。导入之后仍须确认语义与标定。

## 坐标与算法

X=宽度，Y=深度，Z=高度。正视从 -Y 看向 +Y（右=X、上=Z）；俯视从 +Z 看向 -Z（右=X、上=Y）；右侧从 +X 看向 -X（右=Y、上=Z）。左侧视图将水平坐标反转到 +Y。用户镜像为额外修正。第一/第三角法只影响整张图纸视图排布，独立标识后的视图使用同一个世界坐标，不会再按角法偷偷镜像。

每个二维闭合区域转换为 `CrossSection(EvenOdd)`，沿未约束轴拉伸覆盖另一视图给定范围，然后 `Manifold.intersect` 求交。模型是输入轮廓反投影的最大公共实体（visual hull）；使用 `subtract` 显式切除人工特征。通过 `Manifold.project` 求实际二维投影并做区域布尔交/并，得到面积 IoU，而非采样像素分数。所有三维运算在 Worker 中完成，释放每个 WASM 对象；更新/超时终止 Worker，旧结果不会覆盖新项目。

详见 [算法](docs/ALGORITHM.md)、[架构](docs/ARCHITECTURE.md)、[局限](docs/LIMITATIONS.md)。

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
