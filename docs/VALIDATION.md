# 本次验证记录

在本次云环境实际执行，非预期结果清单：

- Node 24.22.1，npm 11.9.0。
- `bash scripts/cloud-setup.sh`：冻结锁文件安装（npm ci）、TypeScript 检查、26 项单元/真实 WASM 几何/解析测试、生产构建均通过。
- 三种视图组合的包围盒、长方体/非凸/斜面体积、内孔、多轮廓、三轴圆/矩形切除、精确重投影、坐标矩阵逆、标定/镜像、冲突/退化输入、50 次重建、项目序列化、DXF 与位图边界追踪均由测试断言。
- `npm audit`：0 漏洞（包含开发依赖）。
- `VITE_BASE_PATH=/ViewForge/ npm run build`：成功，Worker 与 WASM 均为同源哈希资源。
- `TEST_BASE_PATH=/ViewForge/ PLAYWRIGHT_PREVIEW=1 CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`：8 项通过，桌面与 Pixel 7 模拟各 4 项，无跳过。
- E2E 覆盖：初始示例；新建；两张 SVG 实际导入/尺寸确认；真实 Worker 重建；相机拖动与触屏触摸事件（画布截图变化）；圆孔后体积与投影变化；撤销重做；IndexedDB 保存/恢复；JSON 打开；STL 二进制三角面记录长度；GLB 文件头与长度；危险 SVG/不支持 DXF/冲突视图拒绝；位图区域显式选择；手绘矩形与拖动顶点后体积从 240000 改为 180000 mm³；手机无横向溢出。
- 软件 WebGL 使用 Chromium SwiftShader。安卓是浏览器设备模拟，未做安卓真机或 Safari 验收。

构建有两条非阻断提示：Manifold JS 包含仅 Node 分支使用的 `node:module`（Vite 外部化；生产 Worker 已实际通过）；主 JS 包约 932 kB（gzip 259 kB），后续可拆分导入器/导出器以优化首屏。没有隐藏或屏蔽这些提示。

GitHub 发布状态应以实际推送和 Actions/Pages 运行结果为准。本地测试通过不等于网站已发布。云环境草稿工具返回 INVALID_ARGUMENT，无法确认云配置保存；恢复命令另见 CLOUD_SETUP.md。

## GitHub 执行结果（2026-11-09）

代码已推送至 `J-Ruan/ViewForge` 的 main 分支。首次 Actions 在 `ubuntu-latest` 的 Playwright 系统依赖安装步骤失败；固定到受支持的 Ubuntu 24.04 后，[第二次运行](https://github.com/J-Ruan/ViewForge/actions/runs/42565375087) 的 **validate 作业成功**，完成类型检查、26 项单元/几何测试、8 项生产子路径 E2E 和构建，上传 `browser-results` 与 `github-pages` 两个产物。

**deploy 作业失败，网站尚未发布**：GitHub Pages 返回 `Failed to create deployment (status: 404)`，明确提示未启用 Pages。需要仓库管理员在 [Settings → Pages](https://github.com/J-Ruan/ViewForge/settings/pages) 将 Source 设为 **GitHub Actions**，然后重跑工作流。当前环境的 Git 推送权限正常，但 GitHub API 域名被出站策略拒绝，且未提供共享浏览器控制工具，因此无法代为完成该仓库管理操作。不能将本地或 CI 构建通过写成线上发布成功。


## Pages 发布成功（2026-11-09）

用户启用 GitHub Actions 作为 Pages Source 后，以提交 `8617254` 重新触发[部署运行 42566543737](https://github.com/J-Ruan/ViewForge/actions/runs/42566543737)。GitHub 显示整体 **Success**：validate 作业 1m 20s，deploy 作业 9s，发布地址为 **https://j-ruan.github.io/ViewForge/**。此前“未发布”的状态已解除。

本次部署前的生产构建、26 项单元/几何测试与 8 项端到端测试均由 CI 验证通过。当前云环境的出站策略仍拒绝 Pages 域名，因此未声称已在此环境完成发布后线上浏览器复验；发布成功依据为 GitHub deploy-pages 的成功结果和返回的站点 URL。

## 0.2 识图流程重设计

- 单元/几何/识别测试扩展到 37 项，包含尺寸链精确还原、矛盾与无效读数阻断、单位换算、无尺寸时不冒用默认值、DXF 原生线性标注、像素边界容差与真实公共轴冲突。
- 完整生产子路径 E2E 为 14 项，桌面与 Pixel 7 模拟均通过：保留原先的导入、建模、切除、导出及手动编辑用例，新增带标题/箭头/尺寸线的 PNG 自动识别、8 处尺寸关联、90×60 标定、90×50 第二视图与实际 180000 mm³ 重建、识别依据叠加、尺寸链修正、JPG 衬线字体、SVG 原始文字、识别元数据保存恢复。
- 收尾增加无效读数保护后，重新通过类型检查、37 项单元测试、生产构建，以及全部 6 项识图专项生产 E2E。完整 14 项也将由同一 Pages 工作流在发布前再次执行。
- `npm audit` 仍为 0 漏洞。识图与几何计算各有独立 Worker，生产构建包含两个同源 Worker 和 Manifold WASM。
- 测试使用可重复合成的阶梯标注图，不把模板字形得分称为统计正确率，不声称通过了安卓真机或任意复杂工程图验收。

CI 首次执行新流程时发现手动编辑用例的上传竞态：文件解析尚未完成就允许输入尺寸，解析结果会覆盖用户刚填写的值。现在整个视图的表单控件在解析期间禁用，并阻止编辑画布事件。增加 400 ms 人为文件读取延迟后，桌面/安卓模拟均验证控件先禁用、随后可标定并生成正确体积；没有删除断言或放宽确认条件。CI 现同时输出公开失败注释、JSON 结果与作业摘要，便于持续诊断。
