# 架构

- `src/types.ts`：可序列化项目、视图、特征及网格/验证结果契约。
- `src/geometry/polygon.ts`：校准、轮廓清理、拓扑预检查、折线简化。
- `src/geometry/engine.ts`：依赖注入 Manifold API，DOM 无关，可在 Node 用真实 WASM 测试。
- `src/geometry/worker.ts`：同源 WASM 初始化、错误传递、网格 Transferable。
- `src/io/import.ts`：SVGLoader 原始矢量与文字、dxf-parser 线性尺寸，调用位图识别 Worker。导入不执行文档脚本。
- `src/recognition/`：连通区域/轮廓分割、确定性字形模板匹配、尺寸线关联、尺寸链方程与分段标定、独立识图 Worker。
- `src/components/RecognitionPanel.tsx`：识别结果确认、尺寸读数修正与来源预览。
- `src/io/project.ts`：v1 JSON 验证、IndexedDB 最近保存、下载。
- `src/io/export.ts`：STL mm / GLB m Y-up；导出后释放 Three 几何和材质。
- `src/components`：二维编辑器、Three 查看器、显式切除表单。
- `src/App.tsx`：项目快照撤销/重做（上限 50）、Worker 生命周期、响应式工作台。
- `src/examples.ts`：七个参数化教学输入；没有预先烘焙的结果网格。

应用静态资源同源加载，用户数据不发送服务器。IndexedDB 保存 JSON 文本，可导出便携副本。大型图片以 data URI 保留，项目历史与本地存储可能占用较多空间；不自动备份到云端。当前单个最近项目记录，无数据库迁移需求；版本不符拒绝加载。

依赖：React 19 / TypeScript 5.9 / Vite 7 / Tailwind 4 / Three 0.187 / Manifold 3.5.4 / dxf-parser 1.1.2 / idb 8。实际 API 以所安装包的 .d.ts 和真实执行验证为准。Node 24，WebAssembly，无跨源隔离和 SharedArrayBuffer 依赖。每次 Worker 重建重新初始化小型 WASM，优先隔离内存和取消可靠性。
