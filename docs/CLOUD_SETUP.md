# 可复用云环境

使用 `/workspace/ViewForge` 现有检出；每个云任务已经隔离，除非用户明确要求，不要创建额外 Git worktree。

- Node 24（最低 22.12）。无需数据库、后端、账号、API Key 或 AI 服务。
- 安装和检查：在仓库运行 `bash scripts/cloud-setup.sh`。npm 缓存位于可写的 `/tmp/viewforge-npm`，不需要更改用户目录权限。
- 启动：`cd /workspace/ViewForge && npm run dev -- --port 5173`。服务进程需要在新任务重新启动，不会随快照保存。
- 就绪检查：本地 HTTP 请求应成功；浏览器初始阶梯体模型尺寸应为 80 × 50 × 60 mm，两幅重投影 IoU 为 100%。只打开端口不代表几何引擎已就绪。
- 浏览器：本机已有 `/usr/bin/chromium`，运行 `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`。其他机器可先 `npx playwright install chromium`。
- 生产 Pages 路径：`VITE_BASE_PATH=/ViewForge/ npm run build`，然后 `TEST_BASE_PATH=/ViewForge/ PLAYWRIGHT_PREVIEW=1 CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`。
- 依赖域名：npm 安装使用 `registry.npmjs.org`；Git 使用平台已有 GitHub HTTPS 代理。运行应用只加载同源静态资源，图纸及模型不发送到云端。

云环境草稿工具本次返回 `INVALID_ARGUMENT`（无法确认保存），因此以上说明保存在仓库中作为恢复依据，不能视为云配置已保存或发布。
