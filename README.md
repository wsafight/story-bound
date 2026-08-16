# Storybound（入戏）

本地优先的 AI 互动故事应用。项目目前处于功能开发阶段，尚未准备上线。

## 重要：数据库结构尚未稳定

当前 SQLite 数据库只用于开发和测试，**不提供结构兼容或无损升级保证**。

- [apps/server/src/db/schema.ts](apps/server/src/db/schema.ts) 始终表示当前代码所需的完整数据库结构。
- 项目暂不维护数据库版本号和迁移链，也不会自动把旧结构升级到新结构。
- 表、字段、约束和种子数据仍可能频繁调整；更新代码后可能需要删除并重新创建本地数据库。
- 结构调整可能是破坏性的，包括清空故事、存档、消息、模型配置和 MOD 配置。
- 不要在当前数据库中保存唯一副本、生产数据或无法重新创建的内容。

设置页可以用 SQLite `VACUUM INTO` 创建运行时一致的数据库快照并下载。它不会自动迁移旧结构，也不包含数据库外的自定义资源；需要完整保留开发环境时，仍应停止服务并备份整个 `data/` 目录。仅复制正在使用的 `story.db` 不能保证包含 WAL 中尚未合并的数据。

当启动时报“开发数据库结构已过期”时，应确认不再需要其中的数据，然后重建本地数据库。任何删除或重建操作都应由开发者明确执行，应用不会自动删除旧数据库。

本地状态标记（2026-08-16）：项目尚未正式使用真实数据，当前 `data/story.db` 只是按最新结构初始化的开发库。正式开始使用前，再由开发者确认是否继续保留、清空或重新初始化。旧开发库如需追溯，可查看 `data/rebuild-backups/story-db-20260816T214423/`。

本地开发库重建流程：

```bash
mkdir -p data/rebuild-backups/story-db-YYYYMMDDTHHMMSS
mv data/story.db data/story.db-shm data/story.db-wal data/rebuild-backups/story-db-YYYYMMDDTHHMMSS/
bun --eval "const { initializeDatabase } = await import('./apps/server/src/db/initialize.ts'); initializeDatabase();"
```

测试通过 [tests/preload.ts](tests/preload.ts) 使用 `/tmp` 下的独立数据库，不应读取或修改 `data/story.db`。

## 开发

```bash
bun install
bun run dev
```

- Web：`http://127.0.0.1:5173/`
- API：`http://127.0.0.1:3001/`

开发模式不会启动模型服务。模型 Provider 不可用时，仍可管理故事卡、存档和本地配置。

项目使用 Bun workspaces：

```text
apps/
  server/       Cordis 服务与 Express HTTP 边界
  web/          React、TanStack Router、TanStack Query 与 Tailwind 前端
packages/
  shared/       前后端共用的 Zod 请求/响应契约、API 定义和纯工具
tests/e2e/      跨应用端到端测试
```

每个 workspace 有独立 `package.json`。根目录只负责统一安装、开发编排、检查和发布构建；未来官网可以作为 `apps/site` 加入，不需要改动现有包边界。

当前 Web 产品只维护桌面端布局，不承诺移动端适配；如需移动体验，将单独设计交互和样式体系。

当前主要技术栈为 React 19、TanStack Router、TanStack Query、Tailwind CSS 4、Vite 8、Express 5、Zod 4、Cordis、SQLite 和 Bun。Web 的 JSON API 查询 key、请求路径与响应 Schema 来自 `packages/shared` 中的同一份 endpoint contract；成功响应会在 API 边界进行 Zod 运行时校验，POST SSE 事件也使用共享的判别联合 Schema 校验。

## 当前能力

- Provider 健康状态、提示词静态片段和前端只读请求使用有界进程内缓存；并发相同请求会合并，写操作会主动失效缓存，不依赖 Redis。
- 新建存档可以选择玩家或指定人物的第一、第二、第三人称视角，并控制时态、回复篇幅和对白密度；这些设置可在故事 MOD 面板中继续调整。
- 存档可以重命名、归档和恢复；归档存档以只读方式打开。
- 对话中的消息可以固定为记忆；结束章节时可编辑标题与回顾，回顾会加入后续模型上下文。
- 对话页可以导出当前采用分支的 Markdown；设置页可以创建并下载 SQLite 一致性备份。
- 当前章节回顾与固定记忆保存在现有运行时检查点 JSON 中，没有引入数据库版本号或迁移链。

## 数据导出与备份

- 对话页右上角的下载按钮导出 Markdown，内容包含当前消息路径和章节回顾。
- 设置页的“本地数据备份”可以创建、列出和下载 `.sqlite` 快照。
- 设置页可以恢复由当前版本创建的 `.sqlite` 快照；恢复前服务端会自动创建安全备份，完成后页面刷新。不同代码版本之间仍不保证结构兼容，重要数据仍应额外备份整个 `data/` 目录。

## 验证

```bash
bun run typecheck
bun run check
bun run test
bun run build
bun run compile
bun run test:e2e
bun audit
```

首次运行端到端测试前需要安装 Chromium：`bunx playwright install chromium`。`compile` 输出 `build/storybound`；生产运行时需要先生成 `apps/web/dist/`，并从项目根目录执行 `NODE_ENV=production ./build/storybound`。

产品范围见 [docs/PRODUCT.md](docs/PRODUCT.md)，开源产品学习见 [docs/PRODUCT_RESEARCH.md](docs/PRODUCT_RESEARCH.md)，技术约束见 [docs/TECH.md](docs/TECH.md)。
