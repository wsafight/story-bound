# Storybound（入戏）- 技术文档

## 一、技术目标

系统面向单人使用，应用与数据层在本机运行；模型推理可以来自本地或用户配置的远程服务。技术设计优先保证：

- 一张故事卡可以创建多次互不干扰的对话。
- 对话创建后使用不可变的设定快照，避免故事卡修改影响旧存档。
- 玩家、能力、故事状态、记忆和消息拥有明确的数据边界。
- 长对话的上下文可控、可查看、可修正。
- 模型生成失败、取消或断开时不破坏已经保存的数据。
- 数据可以本地备份、恢复和导入导出。

当前不需要账号、权限、云同步、多租户和多人实时协作。

## 二、技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | React 19 + TypeScript | 页面和交互 |
| 路由与服务端状态 | TanStack Router + TanStack Query | 文件路由、loader 预取、缓存和失效 |
| 样式 | Tailwind CSS 4 | utility-first 样式和构建时未使用 CSS 剔除 |
| 构建 | Vite 8 | 开发和前端构建 |
| 运行时 | Bun | 服务运行、依赖管理和构建 |
| 后端 | Express 5 | 本地 HTTP API 和流式响应 |
| 应用运行时 | `@deepseek-ai/cordis` 4.0.1 | 基础设施与业务 Service、插件生命周期、后台任务和生成事件 |
| 固定结构校验 | Zod 4 | API 请求/响应、配置和内部 TypeScript 数据结构 |
| 模型协议 | OpenAI-compatible API | 统一模型列表、聊天和流式响应协议 |
| 模型 Provider | 本地或远程 OpenAI-compatible 服务 | 每次生成使用不可变配置快照，可选 DeepSeek 思考模式 |
| AI 调用 | 原生 `fetch` + 内部 `LlmAdapter` 契约 | 严格流式协议、思考内容、usage 与错误归一化 |
| SSE 解析 | `eventsource-parser` | 解析前端收到的 POST SSE 响应 |
| 数据库 | SQLite | 故事卡、对话、消息、状态和记忆 |
| 数据库驱动 | `bun:sqlite` | 减少原生依赖并适配 Bun |
| 单元测试 | `bun:test` | 领域逻辑和协议测试 |
| 端到端测试 | Playwright | 核心游玩流程验证 |

`packages/shared` 是前后端固定结构的单一事实来源：请求 Schema、响应 DTO Schema、API 路径/endpoint contract 和 SSE 事件联合类型都在此定义。Web 的 React Query key 与 query function 从同一个 contract 派生，并在 API/SSE 边界对成功响应做 Zod 运行时校验。

动态 JSON Schema/Ajv 已用于故事卡自定义状态字段的受限校验；能力参数与能力结果已有 Schema 存储和执行期校验，自动状态提取仍属于后续阶段。状态编辑、能力执行、状态建议和节点进度更新已共用 StateMutation 提交管线。Prompt profile audit 与真实 prompt golden 评估已接入服务端测试，Promptfoo 模型评测仍属于后续阶段设计，当前依赖和默认验证流程中尚未引入。下文涉及未实现部分的章节描述目标约束，不代表当前已经完整实现。

### 依赖边界

- 上游 HTTP、SSE、Provider 私有字段和错误映射只允许出现在 `llm/` 目录，Route、Service 和 Domain 层只依赖项目自己的 `LlmAdapter` 契约。
- 当前固定结构统一使用 Zod；未来引入数据库中可编辑、可导入的动态 JSON Schema 时，再由 Ajv 负责，两者不能混用。
- `eventsource-parser` 同时用于适配器和浏览器端，但两者协议独立：上游严格要求 `[DONE]`，应用流严格要求 `completed` 或 `error`。
- Promptfoo 尚未加入依赖；若后续建立模型评测，它只作为手动开发工具，不进入生产程序。
- Cordis 管理进程级基础设施和受控扩展点，包括数据库与 HTTP Server 生命周期、服务依赖、MOD Fiber 和生成事件。SQLite 事务、凭据读取、Provider 地址校验、消息树一致性和最终落库不能交给插件事件。
- 第一阶段只加载随应用发布或由服务端代码显式安装的插件，不允许浏览器上传或直接安装任意 npm 包。
- 第一版不引入 LangChain、LlamaIndex、Mem0 或通用 Agent 框架。只有出现大量文档 RAG 或多步骤外部工具编排需求时再重新评估。

## 三、系统架构

```text
浏览器
  │
  │ HTTP / 流式 SSE
  ▼
React 前端
  │
  ▼
Express API
  ├── 故事卡服务
  ├── 对话与快照服务
  ├── 能力和状态服务
  ├── 导演与故事节点服务
  ├── 章节与知识簿服务
  ├── 上下文与记忆服务
  ├── Cordis 应用运行时
  │     ├── database / llm / scheduler / http / application Service
  │     ├── stories / conversations / providers / backups 业务 Service
  │     ├── generationMetrics 监控插件与 backgroundTasks
  │     ├── storybound/prompt/assemble 瀑布管线
  │     └── storybound/generation/* 生命周期事件和 MOD Fiber
  └── 模型适配器
        │
        ▼
OpenAI-compatible Adapter
        │
        ▼
本地或远程 OpenAI-compatible 服务

Express API
  │
  ▼
SQLite
  ├── 故事卡和人物
  ├── 玩家档案
  ├── 对话快照
  ├── 消息
  ├── 节点、章节与导演指令
  └── 知识簿与记忆
```

### 分层职责

| 层级 | 职责 |
|------|------|
| Route | HTTP 参数解析、身份为本机的访问约束、响应和错误映射 |
| Service | 新建对话、发送消息、重新生成、更新状态等用例 |
| Domain | 玩家合并、能力校验、状态转换、上下文预算等纯逻辑 |
| Repository | SQLite 查询、事务和数据映射 |
| LLM Adapter | 屏蔽不同模型服务的接口、流式格式和错误差异 |
| Cordis Runtime | 管理进程资源、服务依赖、自动清理、提示词扩展和只读生成事件 |

路由层不能直接拼接提示词或执行散落的 SQL。

### Cordis 扩展契约

- `storybound-application` Fiber 按数据库、可信 MOD、监控、后台任务、HTTP Server 的顺序启动；停止时先取消生成并关闭 HTTP，再停止后台任务和监控、卸载 MOD，最后清理模型缓存并关闭数据库。
- `database`、`llm`、`scheduler`、`http` 和 `application` 是基础设施 Service；`stories`、`conversations`、`providers`、`backups` 和 `runtimeAdmin` 是 HTTP 使用的业务 Service。
- 故事、对话、Provider 和备份 Repository 可以绑定 `database.connection`。SQLite 写入仍使用显式事务；消息树、检查点与最终落库不能改成事件驱动。
- `llm` 为每个运行时实例持有独立的 Provider 健康缓存和凭据解析器；生成服务通过注入的 `llm.stream()` 调用模型。`scheduler` 持有进程并发状态，不再依赖路由模块全局计数。
- `storybound` Service 是核心扩展入口。插件通过 `inject: ['storybound']` 等待运行时就绪。
- `storybound/prompt/assemble` 使用异步 waterfall。插件必须调用 `next()` 才会继续下游组装，并返回完整的 Prompt Assembly。
- `storybound/generation/accepted`、`started`、`completed` 和 `failed` 是只读生命周期事件；插件失败只记录运行时日志，不能改变已经确定的生成结果。
- 插件通过 `installStoryboundPlugin()` 安装，Cordis Fiber 负责监听器和副作用的卸载清理。
- `storybound-generation-monitoring` 只读监听生成事件，聚合成功率、耗时、Token 与失败码。插件失败不能影响生成结果。
- `/api/runtime` 返回引擎版本、插件、调度器、生成监控和后台任务状态，不返回插件配置、凭据或提示词正文。

### 可信 MOD 契约

- `runtime_mods` 保存受信任目录中 MOD 的全局加载状态与默认配置；未知包不能通过 HTTP 接口进入服务进程。
- 每个已加载 MOD 使用独立 Cordis Fiber，并通过插件 `Config` 对配置做 Zod 校验。配置更新调用 `fiber.update()`，停用时由 Fiber 统一清理监听器和其他 effect。
- 提示词型 MOD 监听 `storybound/prompt/contribute`，只能提交带来源、优先级、必要性和分区的结构化片段。核心提示词构建器负责校验、去重和 Token 预算。
- `conversation_mods` 保存当前存档配置，`mod_snapshot_json` 同时写入对话与每个运行时检查点。生成任务使用其 `expected_checkpoint_id` 对应的 MOD 快照，而不是进程当前配置；故事状态与能力仍从玩家消息绑定的基线检查点恢复。
- `narrative-perspective` 随新存档写入初始 MOD 快照，控制视角主体、人称、时态、篇幅和对白密度。指定人物视角只能引用当前故事卡快照中的人物；全局默认配置不接受依赖具体故事的人物视角。
- 故事中启停 MOD 必须同时匹配 `active_leaf_message_id` 和 `active_checkpoint_id`，且当前不能有活动生成。修改在单个 SQLite 事务中克隆检查点、更新快照并写入 `conversation_events`。
- 立即生效策略仅用于不会迁移结构化状态的 MOD。需要新字段、规则表或不可逆状态变化的 MOD 使用章节边界策略；无法迁移时只允许新存档使用。
- `/api/conversations/:id/context-preview` 可以返回受保护的最终系统提示词、预算分段和 MOD 纳入结果，供本机检查器显示。

## 四、前端信息架构

### 路由

| 路由 | 页面 |
|------|------|
| `/` | 故事库 |
| `/stories/new` | 新建故事卡 |
| `/stories/:storyId` | 故事卡详情和对话列表 |
| `/stories/:storyId/edit` | 编辑故事卡 |
| `/stories/:storyId/conversations/new` | 新建对话配置 |
| `/conversations/:conversationId` | 故事对话 |
| `/settings` | 玩家档案、模型和数据设置 |

### 页面与组件

```text
apps/web/src/
├── app/
│   ├── router.ts
│   ├── apiClient.ts
│   ├── apiQueries.ts
│   └── sseClient.ts
├── pages/
│   ├── StoryLibraryPage.tsx
│   ├── StoryDetailPage.tsx
│   ├── StoryEditorPage.tsx
│   ├── ConversationSetupPage.tsx
│   ├── ConversationPage.tsx
│   └── SettingsPage.tsx
├── blocks/                   # 无业务依赖的可复用组合块
├── components/               # 可复用基础 UI
├── routes/                   # TanStack Router 文件路由
├── shared/                   # 仅前端使用的 UI 工具
├── main.tsx
└── styles/

packages/shared/src/
├── api/                      # 响应 DTO、endpoint contract 与 SSE 事件契约
├── schemas/                  # 前后端共同执行的请求 Zod 契约
└── schemaErrors.ts           # 无 Node、DOM 依赖的纯工具
```

### 前端状态原则

- 当前产品只维护桌面端布局；移动端不通过追加响应式覆盖临时兼容，需要时单独设计。
- SQLite 和服务端 API 是故事卡、对话和消息的真实数据源。
- 页面只保留表单草稿、当前输入、打开面板等临时 UI 状态。
- 新建对话配置在最终确认前保留为本地草稿，刷新后可以恢复。
- 已发送消息先由服务端落库，再确认显示为已保存。
- 生成中的临时文本与已保存消息分离，完成后再用服务端消息替换。
- 切换路由或停止生成时取消对应请求，不取消已经完成的数据库写入。

## 五、后端项目结构

```text
apps/server/src/
├── index.ts
├── app.ts                    # Express 组装入口
├── config.ts
├── http/routes/              # 按资源域拆分的 HTTP 边界
├── runtime/
│   ├── application/          # database/http/application 生命周期 Service
│   ├── business/             # stories/conversations/providers/backups/runtimeAdmin Service
│   ├── mods/                 # 每个可信 MOD 的 Cordis 插件定义
│   └── storyboundRuntime.ts
├── services/
│   ├── conversationService.ts
│   ├── generation/
│   ├── prompt/
│   ├── storyEditor/
│   └── conversationManagement/
├── repositories/
├── llm/
└── db/
```

## 六、数据库设计

### 存储约定

- 主键使用 UUID 字符串，不能依赖数组索引或标题。
- 时间统一保存为 UTC ISO 8601 字符串。
- SQLite 启用 `foreign_keys`、WAL 和合理的 `busy_timeout`。
- 多表写入必须使用事务，例如创建故事卡和创建对话。
- JSON 字段在读写时必须经过对应校验：固定快照结构使用 Zod，故事卡定义的动态字段使用 Ajv。
- 上线前只维护 `apps/server/src/db/schema.ts` 中的一份当前完整结构，不维护版本号或顺序迁移链。
- 故事卡和对话优先软归档；清空回收站时才物理删除。

外键删除策略必须在当前结构中显式声明：故事卡的模板子项使用 `ON DELETE CASCADE`；`conversations.story_card_id` 和 `conversations.forked_from_conversation_id` 使用 `ON DELETE SET NULL`；对话自己的消息、检查点、事件、章节、记忆和任务使用 `ON DELETE CASCADE`。因此物理删除故事卡只删除模板，已有对话依靠快照继续存在；物理删除对话才清理其完整存档。

### Schema 校验策略

固定结构使用 Zod，包括 API 请求、数据库映射、故事卡快照外层结构、消息、生成任务和错误响应。

动态结构使用受限的 JSON Schema Draft 7，包括：

- `story_cards.state_schema_json`。
- `player_templates.field_schema_json`。
- `abilities.config_schema_json`。
- `abilities.input_schema_json` 和 `abilities.result_schema_json`。

动态 Schema 写入数据库前先校验 Schema 本身，再使用 Ajv 编译。允许的关键字限制为 `type`、`properties`、`required`、`additionalProperties`、`items`、`enum`、`const`、`minimum`、`maximum`、`multipleOf`、`minLength` 和 `maxLength` 等确定性规则；禁止远程 `$ref`、动态加载代码和未审核的自定义 format。

Ajv 使用 `strict: true`、`allErrors: true`、`coerceTypes: false` 和 `removeAdditional: false`。对象 Schema 必须显式声明 `type: "object"` 和 `additionalProperties: false`，空对象结构使用 `{"type":"object","properties":{},"additionalProperties":false}`，不能用会接受任意数据的 `{}` 代替。已编译校验器按 Schema 哈希缓存，故事卡版本变化时失效。

JSON Schema 只描述类型、范围和必填规则。可编辑、锁定、受保护以及由谁维护等策略属于固定结构，分别保存在 `player_templates.field_policy_json` 和 `story_cards.state_policy_json`，使用 Zod 校验；不能依赖 Ajv 自定义关键字表达权限。

运行时状态保留 `/phase`、`/scene/location`、`/scene/time` 和 `/scene/participantIds` 标准路径。应用在编译故事卡状态 Schema 时加入并校验这些保留字段，故事卡自定义变量统一放在 `/custom` 下。字段策略中的路径使用受限 JSON Pointer，并且必须能在最终状态 Schema 中解析。

### 固定枚举与主体标识

数据库中的固定枚举同时由当前结构的 `CHECK` 约束和共享 Zod Schema 校验，不能只依赖 TypeScript 类型：

| 字段 | 允许值 |
|------|--------|
| `characters.role_type` | `main`、`supporting`、`background` |
| `abilities.category` | `player`、`character`、`mechanic` |
| `messages.sender` | `player`、`character`、`narrator` |
| `messages.input_mode` | `dialogue`、`action`、`narration` 或空 |
| 知识 `kind` | `world_fact`、`belief`、`rumor`、`clue` |
| 知识 `truth_status` | `confirmed`、`uncertain`、`false` |

`known_by_json` 使用固定主体对象数组：`{"type":"player"}`、`{"type":"all"}` 或 `{"type":"character","id":"..."}`。`all` 不能与其他主体并存；人物 ID 必须属于同一故事卡或对话快照。其他状态枚举在对应表说明中定义，并采用相同的 Zod 与数据库双重校验。

### 节点条件 DSL

故事节点的 `prerequisites`、`completion_conditions` 和事实的 `reveal_conditions` 使用应用定义的声明式条件树，不接受 JavaScript 表达式或任意 JSON Logic 插件。允许的条件包括：

- `all`、`any` 和 `not` 组合。
- 状态路径与 `eq`、`ne`、`gt`、`gte`、`lt`、`lte`、`in` 比较。
- 指定节点是否达到某个状态。
- 指定知识条目是否有效、是否被某个主体知晓或是否具有某个真伪状态。

条件树使用固定 Zod Schema 校验，并限制最大深度、节点数量和状态路径长度。`evaluateNodeConditions` 是无副作用的纯函数；模型只能提出建议，不能提供或执行新的条件表达式。节点完成后的状态补丁仍要经过故事卡状态 Schema 和受保护路径白名单校验。

### 表关系

```text
story_cards 1 ── * characters
story_cards 1 ── 1 player_templates
story_cards 1 ── * abilities
story_cards 1 ── * scenes
story_cards 1 ── * story_nodes
story_cards 1 ── * story_facts
story_cards 1 ── * story_card_versions
story_cards 1 ── * conversations

player_profiles ── 创建对话时合并 ──> conversations.player_snapshot_json

conversations 1 ── * messages
conversations 1 ── * generations
conversations 1 ── * operation_receipts
conversations 1 ── * background_jobs
conversations 1 ── * memories
conversations 1 ── * state_events
conversations 1 ── * timeline_events
conversations 1 ── * runtime_checkpoints
conversations 1 ── * story_suggestions
conversations 1 ── * conversation_nodes
conversations 1 ── * knowledge_entries
conversations 1 ── * chapters
conversations 1 ── * director_instructions
generations * ── * director_instructions（通过 generation_director_instructions）
```

### 核心表

#### `story_cards`

```text
id                          TEXT PRIMARY KEY
title                       TEXT NOT NULL
cover                       TEXT
summary                     TEXT NOT NULL DEFAULT ''
description                 TEXT NOT NULL DEFAULT ''
background                  TEXT NOT NULL DEFAULT ''
world_rules                 TEXT NOT NULL DEFAULT ''
content_warnings_json       TEXT NOT NULL DEFAULT '[]'
content_boundaries_json     TEXT NOT NULL DEFAULT '[]'
tags_json                   TEXT NOT NULL DEFAULT '[]'
state_schema_json           TEXT NOT NULL DEFAULT '{"type":"object","properties":{},"additionalProperties":false}'
default_state_json          TEXT NOT NULL DEFAULT '{}'
state_policy_json           TEXT NOT NULL DEFAULT '[]'
default_model_config_json   TEXT NOT NULL DEFAULT '{}'
version                     INTEGER NOT NULL DEFAULT 1
status                      TEXT NOT NULL DEFAULT 'draft'
status_before_trash         TEXT
created_at                  TEXT NOT NULL
updated_at                  TEXT NOT NULL
trashed_at                  TEXT
```

`status` 只能是 `draft`、`active`、`archived` 或 `trashed`。新建和存在 lint error 的版本保持 `draft`；通过确定性体检后才能发布为 `active`。`active` 与 `archived` 可以互相转换，只有 `draft` 或 `archived` 可以进入 `trashed`。进入回收站时保存 `status_before_trash` 和 `trashed_at`，恢复时回到原状态。

`content_warnings_json` 是详情页展示的敏感主题提示，只用于帮助用户预判故事内容，不能被解释成“模型禁止描写”。`content_boundaries_json` 单独记录需要避免、淡化或跳过的内容及处理方式，经过固定 Zod Schema 校验后注入模型规则。

`default_state_json` 必须通过最终编译后的 `state_schema_json` 校验。`state_policy_json` 是由固定 Zod Schema 校验的路径策略列表，记录路径是否允许创建时覆盖、故事中手动修改，以及是否只能由应用内置规则维护。状态 Schema、默认状态和字段策略必须在同一故事卡版本中一起校验和保存。

更新故事卡及其子项时，在同一事务中增加 `version` 并写入不可变版本快照。更新请求携带当前版本，版本不一致时返回 `409 CONFLICT`，避免旧页面覆盖新内容。保存后存在确定性错误的故事卡自动转为 `draft`，修正并通过体检后才可以重新发布。

#### `story_card_versions`

```text
id                    TEXT PRIMARY KEY
story_card_id         TEXT NOT NULL REFERENCES story_cards(id) ON DELETE CASCADE
version               INTEGER NOT NULL
snapshot_json         TEXT NOT NULL
lint_result_json      TEXT NOT NULL DEFAULT '[]'
created_at            TEXT NOT NULL
UNIQUE (story_card_id, version)
```

版本快照保存该版本完整的故事卡及子项，不依赖当前物化表。第二阶段编辑器从首次保存开始写入版本；第三阶段的比较和恢复直接使用该表。恢复旧版本会创建一个新的递增版本，不覆盖或删除历史版本。

#### `characters`

```text
id                    TEXT PRIMARY KEY
story_card_id         TEXT NOT NULL REFERENCES story_cards(id) ON DELETE CASCADE
name                  TEXT NOT NULL
avatar                TEXT
role_type             TEXT NOT NULL
appearance            TEXT NOT NULL DEFAULT ''
personality           TEXT NOT NULL DEFAULT ''
speech_style          TEXT NOT NULL DEFAULT ''
goals                 TEXT NOT NULL DEFAULT ''
knowledge_scope       TEXT NOT NULL DEFAULT ''
relationships_json    TEXT NOT NULL DEFAULT '{}'
can_speak             INTEGER NOT NULL DEFAULT 1
sort_order            INTEGER NOT NULL DEFAULT 0
```

#### `player_profiles`

```text
id                    TEXT PRIMARY KEY
name                  TEXT NOT NULL
age                   INTEGER
appearance            TEXT NOT NULL DEFAULT ''
background            TEXT NOT NULL DEFAULT ''
custom_fields_json    TEXT NOT NULL DEFAULT '{}'
created_at            TEXT NOT NULL
updated_at            TEXT NOT NULL
```

#### `player_templates`

```text
id                    TEXT PRIMARY KEY
story_card_id         TEXT NOT NULL UNIQUE REFERENCES story_cards(id) ON DELETE CASCADE
role_name             TEXT NOT NULL DEFAULT ''
background            TEXT NOT NULL DEFAULT ''
relationships_json    TEXT NOT NULL DEFAULT '{}'
goals                 TEXT NOT NULL DEFAULT ''
field_schema_json     TEXT NOT NULL DEFAULT '{"type":"object","properties":{},"additionalProperties":false}'
default_values_json   TEXT NOT NULL DEFAULT '{}'
field_policy_json     TEXT NOT NULL DEFAULT '[]'
```

`field_schema_json` 只定义字段类型、范围和是否必填，`field_policy_json` 单独定义字段是否允许玩家档案、开场或本次显式值覆盖，以及是否锁定。特殊故事属性使用这两个结构扩展，不增加一次性数据库列。

一张故事卡只有一个玩家模板。不同开场需要不同玩家身份时，由 `scenes.player_overrides_json` 覆盖模板中允许编辑的字段，而不是为每个开场建一份模板。覆盖值只能作用于非锁定字段，并在创建对话时参与合并，优先级为“玩家模板 < 玩家档案 < 开场覆盖 < 本次显式覆盖”：通用档案先提供个人信息，开场再设置本次介入身份，用户最后确认的显式值优先；锁定字段始终取模板值。

#### `abilities`

```text
id                    TEXT PRIMARY KEY
story_card_id         TEXT NOT NULL REFERENCES story_cards(id) ON DELETE CASCADE
name                  TEXT NOT NULL
category              TEXT NOT NULL
owner_character_id    TEXT REFERENCES characters(id)
description           TEXT NOT NULL DEFAULT ''
rules                 TEXT NOT NULL DEFAULT ''
execution_mode        TEXT NOT NULL DEFAULT 'prompt'
handler_key           TEXT
config_schema_json    TEXT NOT NULL DEFAULT '{"type":"object","properties":{},"additionalProperties":false}'
default_config_json   TEXT NOT NULL DEFAULT '{}'
input_schema_json     TEXT NOT NULL DEFAULT '{"type":"object","properties":{},"additionalProperties":false}'
result_schema_json    TEXT NOT NULL DEFAULT '{"type":"object","properties":{},"additionalProperties":false}'
prompt                TEXT NOT NULL DEFAULT ''
sort_order            INTEGER NOT NULL DEFAULT 0
```

`execution_mode` 只能是 `prompt` 或 `builtin_tool`：

- `prompt` 只影响模型上下文，适合叙事能力和人物特征。
- `builtin_tool` 允许模型请求执行应用内置能力，由 `handler_key` 映射到代码中的白名单处理器。

故事卡不能保存或执行任意 JavaScript、Shell 命令、SQL 或网络地址。即使模型适配器已校验工具参数，应用仍须用 Ajv 再次校验输入，随后由 `stateService` 检查归属、启用状态、次数、冷却和前置条件。

`config_schema_json` 校验新建对话时保存的能力配置；`input_schema_json` 校验每次能力调用的参数；`result_schema_json` 校验内置处理器返回给模型的结果。三者不能互相代替。

能力参数只允许布尔值、数字、短文本、单选、多选和受限对象。数字必须声明最小值、最大值和步长，选项必须来自固定枚举。

#### `scenes`

```text
id                    TEXT PRIMARY KEY
story_card_id         TEXT NOT NULL REFERENCES story_cards(id) ON DELETE CASCADE
title                 TEXT NOT NULL
description           TEXT NOT NULL DEFAULT ''
location              TEXT NOT NULL DEFAULT ''
time_label            TEXT NOT NULL DEFAULT ''
participant_ids_json  TEXT NOT NULL DEFAULT '[]'
entry_method          TEXT NOT NULL DEFAULT ''
opening_message       TEXT NOT NULL
opening_sender        TEXT NOT NULL DEFAULT 'narrator'
opening_character_id  TEXT REFERENCES characters(id)
initial_state_json    TEXT NOT NULL DEFAULT '{}'
player_overrides_json TEXT NOT NULL DEFAULT '{}'
is_default            INTEGER NOT NULL DEFAULT 0
sort_order            INTEGER NOT NULL DEFAULT 0
```

同一故事卡最多一个默认开场，由服务层在事务中维护。

`opening_sender` 只能是 `narrator` 或 `character`；选择 `character` 时 `opening_character_id` 必填且必须出现在 `participant_ids_json` 中。地点、时间和在场人物同时写入运行时状态的保留路径，`initial_state_json` 只能覆盖状态策略允许在开场设置的字段。

#### `story_nodes`

```text
id                           TEXT PRIMARY KEY
story_card_id                TEXT NOT NULL REFERENCES story_cards(id) ON DELETE CASCADE
title                        TEXT NOT NULL
summary                      TEXT NOT NULL DEFAULT ''
instructions                 TEXT NOT NULL DEFAULT ''
prerequisites_json           TEXT NOT NULL DEFAULT '{}'
participant_ids_json         TEXT NOT NULL DEFAULT '[]'
reveal_fact_ids_json         TEXT NOT NULL DEFAULT '[]'
completion_conditions_json   TEXT NOT NULL DEFAULT '{}'
state_patch_json             TEXT NOT NULL DEFAULT '{}'
priority                     INTEGER NOT NULL DEFAULT 0
is_skippable                 INTEGER NOT NULL DEFAULT 1
spoiler_level                TEXT NOT NULL DEFAULT 'hint'
sort_order                   INTEGER NOT NULL DEFAULT 0
```

节点中的人物、事实和其他节点引用保存在 JSON 中，由故事卡体检和保存事务验证必须属于同一故事卡。

#### `story_facts`

```text
id                         TEXT PRIMARY KEY
story_card_id              TEXT NOT NULL REFERENCES story_cards(id) ON DELETE CASCADE
kind                       TEXT NOT NULL
truth_status               TEXT NOT NULL DEFAULT 'confirmed'
content                    TEXT NOT NULL
known_by_json              TEXT NOT NULL DEFAULT '[]'
is_secret                  INTEGER NOT NULL DEFAULT 0
reveal_conditions_json     TEXT NOT NULL DEFAULT '{}'
related_node_ids_json      TEXT NOT NULL DEFAULT '[]'
initial_status             TEXT NOT NULL DEFAULT 'active'
is_locked                  INTEGER NOT NULL DEFAULT 0
sort_order                 INTEGER NOT NULL DEFAULT 0
```

`kind` 描述内容用途，`truth_status` 描述确定、存疑或错误，`is_secret` 描述可见性。人物是否已经知道该内容只由 `known_by_json` 决定，不能通过摘要或模型建议把这些维度互相覆盖。

#### `conversations`

```text
id                          TEXT PRIMARY KEY
story_card_id               TEXT REFERENCES story_cards(id) ON DELETE SET NULL
source_player_profile_id    TEXT REFERENCES player_profiles(id) ON DELETE SET NULL
title                       TEXT NOT NULL
card_version                INTEGER NOT NULL
card_snapshot_json          TEXT NOT NULL
player_snapshot_json        TEXT NOT NULL
ability_snapshot_json       TEXT NOT NULL
source_scene_id             TEXT
scene_snapshot_json         TEXT NOT NULL
model_config_json           TEXT NOT NULL DEFAULT '{}'
state_json                  TEXT NOT NULL DEFAULT '{}'
current_chapter_id          TEXT
active_leaf_message_id      TEXT
active_checkpoint_id        TEXT
forked_from_conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL
forked_from_message_id      TEXT
status                      TEXT NOT NULL DEFAULT 'active'
status_before_archive       TEXT
status_before_trash         TEXT
metadata_version            INTEGER NOT NULL DEFAULT 1
created_at                  TEXT NOT NULL
updated_at                  TEXT NOT NULL
trashed_at                  TEXT
```

`card_snapshot_json` 包含背景、人物、玩家模板、世界规则、内容边界、状态定义、默认状态、字段策略、故事节点和初始事实。对话运行时只读取快照，不再读取故事卡的可变正文。

`story_card_id` 用于来源追踪和列表聚合。故事卡归档不会删除对话；故事卡在清空回收站后被物理删除时该字段置空，对话进入故事库的“独立存档”列表并继续读取自己的快照。`source_player_profile_id` 只用于显示创建来源，玩家档案删除后置空，不影响 `player_snapshot_json`。

`current_chapter_id`、`active_leaf_message_id`、`active_checkpoint_id` 和消息的 `chapter_id` 是运行时指针。服务层必须验证目标属于同一对话；由于表之间存在循环引用，当前结构不声明这些循环外键，而是通过事务、启动诊断和集成测试维护一致性。

当前阶段保存在 `state_json` 的 `phase` 路径中，取值范围由故事卡 `state_schema` 定义，不额外设置 `current_phase` 列。当前激活的故事节点由 `conversation_nodes` 中唯一一行 `active` 记录表示，不在对话表中冗余保存节点指针。阶段摘要保存在 `memories`，章节摘要保存在 `chapters`，对话表不保存摘要正文。

`forked_from_conversation_id` 和 `forked_from_message_id` 记录派生来源，仅用于溯源展示。派生对话复制来源快照与截断后的消息，之后完全独立演化。

`status` 只能是 `active`、`completed`、`archived` 或 `trashed`。`active` 与 `completed` 可以互相转换；归档时把原状态写入 `status_before_archive`，取消归档时恢复；进入回收站时再记录 `status_before_trash`，从回收站恢复后仍保持删除前状态。每次转换都由服务层校验，不能通过通用字段 PATCH 写入任意字符串。

`metadata_version` 只在重命名和生命周期转换时递增，用于元数据页面的乐观并发控制；消息与运行时状态并发分别使用活动叶节点、活动检查点和命令幂等键，不复用这个版本号。

#### `messages`

```text
id                    TEXT PRIMARY KEY
conversation_id       TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
chapter_id            TEXT NOT NULL
client_message_id     TEXT
parent_message_id     TEXT REFERENCES messages(id)
generation_id         TEXT REFERENCES generations(id)
runtime_checkpoint_id TEXT
sender                TEXT NOT NULL
character_id          TEXT
input_mode            TEXT
content               TEXT NOT NULL
metadata_json         TEXT NOT NULL DEFAULT '{}'
created_at            TEXT NOT NULL
```

消息使用 `conversation_id` 隔离。`parent_message_id` 形成消息树，`active_leaf_message_id` 指向当前采用的故事路径。`runtime_checkpoint_id` 指向采用该消息版本后应使用的结构化运行时状态；未造成结构化变化的消息可以复用父消息的检查点。

同一父消息下允许存在多个兄弟消息，用来保留最后一轮的多个候选版本，因此不能对 `(parent_message_id, 版本号)` 建唯一约束：

- 重新生成一条人物回复，产生同一父消息下的另一条 `character` 消息，各自绑定不同的 `generation_id`。
- 编辑玩家消息后重试，产生同一父消息下的另一条 `player` 消息。

模型回复的唯一性由 `generation_id` 保证：一次生成任务最多落一条回复消息。玩家消息不参与该约束，其去重由 `client_message_id` 负责。同一轮的版本序号不落库，由前端按同一父节点下的 `(created_at, id)` 稳定顺序计算展示。用户沿某个版本继续发送后，其他候选只能用于派生新对话，不能再原地切换。

#### `generations`

```text
id                    TEXT PRIMARY KEY
conversation_id       TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
player_message_id     TEXT NOT NULL REFERENCES messages(id)
attempt               INTEGER NOT NULL DEFAULT 1
provider              TEXT NOT NULL
model                 TEXT NOT NULL
status                TEXT NOT NULL
error_code            TEXT
prompt_tokens         INTEGER
completion_tokens     INTEGER
context_estimate_json TEXT NOT NULL DEFAULT '{}'
base_checkpoint_id    TEXT NOT NULL
expected_leaf_id      TEXT NOT NULL
expected_checkpoint_id TEXT NOT NULL
working_runtime_json  TEXT
created_at            TEXT NOT NULL
started_at            TEXT
finished_at           TEXT
```

`status` 只能是 `accepted`、`streaming`、`completed`、`cancelled` 或 `failed`。生成任务单独持久化，使刷新页面、模型失败或服务重启后仍能判断一条玩家消息是否等待回复。

回复消息与生成任务的关联只保存在 `messages.generation_id` 一侧，生成任务不再冗余保存 `assistant_message_id`。`completed` 任务必须存在唯一对应的回复消息，由启动诊断和集成测试校验。

上游返回 usage 时保存 `prompt_tokens` 和 `completion_tokens`，`context_estimate_json` 保存本次组装时各上下文分段的估算值。两者用于校准字符估算系数，缺失时留空，不阻塞生成。

`base_checkpoint_id` 固定本次生成使用的运行时基线。`expected_leaf_id` 和 `expected_checkpoint_id` 保存结果提交前必须仍然成立的乐观并发条件；普通发送时它们指向新玩家消息，重新生成或编辑重试时则指向当前仍在采用的旧版本。模型工具调用只更新该生成任务的 `working_runtime_json`，不能在流式生成过程中直接覆盖对话当前状态；生成成功时才创建结果检查点并原子切换，失败或取消时丢弃工作副本。

#### `operation_receipts`

```text
conversation_id       TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
operation_id          TEXT NOT NULL
type                  TEXT NOT NULL
request_hash          TEXT NOT NULL
result_json           TEXT NOT NULL DEFAULT '{}'
created_at            TEXT NOT NULL
PRIMARY KEY (conversation_id, operation_id)
```

版本选择、编辑重试、重新生成、派生、能力执行和其他不可安全重复的命令先写入操作收据。重复 `operation_id` 且请求哈希相同时返回原结果；哈希不同时返回 `409 IDEMPOTENCY_KEY_REUSED`。

#### `background_jobs`

```text
id                    TEXT PRIMARY KEY
conversation_id       TEXT REFERENCES conversations(id) ON DELETE CASCADE
source_generation_id  TEXT REFERENCES generations(id)
type                  TEXT NOT NULL
idempotency_key       TEXT NOT NULL UNIQUE
payload_json          TEXT NOT NULL DEFAULT '{}'
status                TEXT NOT NULL DEFAULT 'pending'
attempts              INTEGER NOT NULL DEFAULT 0
available_at          TEXT NOT NULL
error_code            TEXT
created_at            TEXT NOT NULL
updated_at            TEXT NOT NULL
```

自动记忆摘要、事实与状态建议提取等生成后工作必须先持久化为任务，再交给 `workScheduler`。`status` 只能是 `pending`、`running`、`completed` 或 `failed`；`idempotency_key` 由任务类型、来源 ID 和输入区间哈希组成。应用启动时把残留的 `running` 任务恢复为 `pending`，达到重试上限后才标记为 `failed` 并在诊断界面显示。

#### `memories`

```text
id                    TEXT PRIMARY KEY
conversation_id       TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
type                  TEXT NOT NULL
content               TEXT NOT NULL
source_message_id     TEXT REFERENCES messages(id)
is_locked             INTEGER NOT NULL DEFAULT 0
metadata_json         TEXT NOT NULL DEFAULT '{}'
created_at            TEXT NOT NULL
updated_at            TEXT NOT NULL
```

摘要记忆在 `metadata_json` 中记录覆盖区间的起止消息 ID，原消息始终保留。

#### `state_events`

```text
id                    TEXT PRIMARY KEY
conversation_id       TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
source                TEXT NOT NULL
source_message_id     TEXT REFERENCES messages(id)
reverts_event_id      TEXT REFERENCES state_events(id)
patch_json            TEXT NOT NULL
before_json           TEXT NOT NULL
after_json            TEXT NOT NULL
created_at            TEXT NOT NULL
```

能力使用、用户调整和模型建议造成的状态变化都写入该表，用于审计、撤销和故障排查。每条记录通过 `source_message_id` 锚定到当前消息路径，并在同一事务中创建新的运行时检查点。

`source` 只能是 `user`、`ability`、`suggestion`、`node` 或 `revert`。普通事件的 `reverts_event_id` 为空；`revert` 事件必须指向被撤销的普通事件。被撤销记录不删除也不改写，同一普通事件最多被撤销一次，`revert` 事件本身不能再次撤销。

#### `timeline_events`

```text
id                    TEXT PRIMARY KEY
conversation_id       TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
chapter_id            TEXT NOT NULL
anchor_message_id     TEXT REFERENCES messages(id)
type                  TEXT NOT NULL
content               TEXT NOT NULL
metadata_json         TEXT NOT NULL DEFAULT '{}'
created_at            TEXT NOT NULL
```

`timeline_events` 保存需要在故事流中展示的场景变化、能力使用、状态修正和节点变化。它们通过 `anchor_message_id` 与当前路径关联，查询时与消息按 `(created_at, id)` 合并，但不参与 `parent_message_id` 消息树，也不改变 `active_leaf_message_id`。离开当前路径的事件默认不展示。

#### `runtime_checkpoints`

```text
id                    TEXT PRIMARY KEY
conversation_id       TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
parent_checkpoint_id  TEXT REFERENCES runtime_checkpoints(id)
anchor_message_id     TEXT NOT NULL REFERENCES messages(id)
state_json            TEXT NOT NULL
ability_snapshot_json TEXT NOT NULL
node_progress_json    TEXT NOT NULL
knowledge_json        TEXT NOT NULL
created_at            TEXT NOT NULL
```

运行时检查点是结构化状态的分支边界。创建对话、应用能力、接受故事建议、修改或撤销状态、完成节点以及模型工具调用成功时创建检查点；纯文本消息可以引用现有检查点。检查点创建后不可修改，`conversations`、`conversation_nodes` 和 `knowledge_entries` 是活动检查点的物化视图。

选择同一轮的另一个消息版本时，服务在一个事务中把物化视图恢复为该消息的检查点，同时更新 `active_leaf_message_id` 和 `active_checkpoint_id`。若目标版本已有后续消息，则不允许原地切换，只能从目标检查点派生新对话。派生时复制检查点内容，而不是复制来源对话当前的物化状态。

#### `story_suggestions`

```text
id                       TEXT PRIMARY KEY
conversation_id          TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
source_generation_id     TEXT REFERENCES generations(id)
type                     TEXT NOT NULL
payload_json             TEXT NOT NULL
status                   TEXT NOT NULL DEFAULT 'pending'
validation_errors_json   TEXT NOT NULL DEFAULT '[]'
created_at               TEXT NOT NULL
resolved_at              TEXT
```

模型提出的 `state_patch`、`fact_create`、`fact_reveal`、`node_activate` 或 `node_complete` 先保存为建议。校验失败的建议标记为 `invalid`；通过规则自动接受或由用户确认后标记为 `accepted`，拒绝则标记为 `rejected`。执行接受操作时必须根据最新状态重新校验，不能直接回放旧补丁。

#### `conversation_nodes`

```text
id                    TEXT PRIMARY KEY
conversation_id       TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
source_node_id        TEXT NOT NULL
node_snapshot_json    TEXT NOT NULL
status                TEXT NOT NULL
activated_at          TEXT
completed_at          TEXT
```

状态只能是 `locked`、`available`、`active`、`completed` 或 `skipped`。节点引用与条件都从对话快照读取，故事卡后续修改不改变运行中节点。

#### `knowledge_entries`

```text
id                         TEXT PRIMARY KEY
conversation_id            TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
source_fact_id             TEXT
kind                       TEXT NOT NULL
truth_status               TEXT NOT NULL
content                    TEXT NOT NULL
known_by_json              TEXT NOT NULL DEFAULT '[]'
is_secret                  INTEGER NOT NULL DEFAULT 0
status                     TEXT NOT NULL DEFAULT 'active'
reveal_conditions_json     TEXT NOT NULL DEFAULT '{}'
related_node_ids_json      TEXT NOT NULL DEFAULT '[]'
source_message_id          TEXT REFERENCES messages(id)
is_locked                  INTEGER NOT NULL DEFAULT 0
created_at                 TEXT NOT NULL
updated_at                 TEXT NOT NULL
```

知识簿是事实和知情范围的真实数据源。记忆摘要可以引用知识条目，但不能直接修改其内容、状态或 `known_by_json`。

`reveal_conditions_json` 从来源事实复制而来，用户新增的条目默认为空对象。空条件表示该条目不会被自动揭示，只能由节点的 `reveal_fact_ids` 或用户操作揭示。状态、知识或节点变化后，在同一事务中对条件非空且尚未向玩家揭示的条目重新求值；条件成立的条目产生一条 `fact_reveal` 建议，而不是直接改写 `known_by_json`。求值复用 `evaluateNodeConditions` 的同一套条件 DSL 与深度限制。

#### `chapters`

```text
id                    TEXT PRIMARY KEY
conversation_id       TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
number                INTEGER NOT NULL
title                 TEXT NOT NULL DEFAULT ''
start_message_id      TEXT REFERENCES messages(id)
end_message_id        TEXT REFERENCES messages(id)
summary               TEXT NOT NULL DEFAULT ''
is_summary_locked     INTEGER NOT NULL DEFAULT 0
state_snapshot_json   TEXT NOT NULL DEFAULT '{}'
status                TEXT NOT NULL DEFAULT 'active'
created_at            TEXT NOT NULL
completed_at          TEXT
```

章节状态只能是 `active`、`closing` 或 `completed`。同一对话只能有一个 `active` 或 `closing` 章节。章节摘要可编辑和锁定，原始消息不删除。

`start_message_id` 与 `end_message_id` 表达章节在当前采用路径上的区间，这是一个线性语义，与消息版本树存在潜在冲突，因此约束版本操作范围：
- 重新生成、编辑重试和原地版本选择只允许作用于当前 `active` 章节的最后一轮。已 `completed` 章节的消息只读。
- 想改写其他历史内容，走“从此处派生新对话”：复制来源对话的快照、目标消息之前的当前路径和目标检查点，作为一个独立存档继续。
- 章节摘要只覆盖 `active_leaf_message_id` 回溯路径上属于该章节的消息，被放弃的兄弟分支不进入摘要。

对话是存档，章节是存档内的线性单元。跨越已关闭章节的改写通过派生新对话表达，而不是让章节区间去容纳多条路径。

#### `director_instructions`

```text
id                    TEXT PRIMARY KEY
conversation_id       TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
chapter_id            TEXT REFERENCES chapters(id)
type                  TEXT NOT NULL
content               TEXT NOT NULL
scope                 TEXT NOT NULL
status                TEXT NOT NULL
created_at            TEXT NOT NULL
updated_at            TEXT NOT NULL
```

`scope` 只能是 `once`、`chapter` 或 `conversation`。`status` 统一为 `pending`、`active`、`applied` 或 `cancelled`：

- `once` 指令创建后为 `pending`，被生成任务预留后仍为 `pending`，生成成功才转为 `applied`。用户在消费前取消转为 `cancelled`。
- `chapter` 和 `conversation` 指令创建后为 `active`，取消或章节关闭时转为 `cancelled`，不会变成 `applied`。
- 已被某次生成预留的指令不允许取消或编辑，必须先取消该次生成。

指令不写入消息、记忆或知识簿。

#### `generation_director_instructions`

```text
generation_id         TEXT NOT NULL REFERENCES generations(id) ON DELETE CASCADE
instruction_id        TEXT NOT NULL REFERENCES director_instructions(id) ON DELETE CASCADE
status                TEXT NOT NULL
created_at            TEXT NOT NULL
updated_at            TEXT NOT NULL
PRIMARY KEY (generation_id, instruction_id)
```

生成开始时把适用指令关联为 `reserved`。生成成功后关联改为 `applied`，并消费一次性指令；生成失败或取消后关联改为 `released`，一次性指令继续保持 `pending`。

#### `memory_fts`

```sql
CREATE VIRTUAL TABLE memory_fts USING fts5(
  memory_id UNINDEXED,
  conversation_id UNINDEXED,
  content,
  tokenize = 'trigram'
);
```

FTS 表是可重建索引，不是记忆的真实数据源。`memoryService` 在修改 `memories` 的同一事务中同步索引；启动诊断可以发现并重建缺失项。

必须使用 `trigram` tokenizer。默认的 `unicode61` 对中文不做分词，一段连续汉字会被当成单个 token，`MATCH` 查询几乎命中不了任何内容——那不是检索质量下降，而是功能静默失效。因此运行时 SQLite 不支持 `trigram` 时不回退到 `unicode61`，而是：

1. 启动诊断检测 tokenizer 可用性，不可用时不创建 `memory_fts`。
2. 自动把 `MEMORY_SEARCH` 降为 `like`，改用带长度下限的 `LIKE '%关键词%'` 扫描当前对话的记忆。单人本地库规模下这个成本可以接受，行为也可预测。
3. 在设置页显示当前检索模式及降级原因。

`MEMORY_SEARCH=none` 时只使用 `pinned` 记忆和按时间顺序的章节摘要，不做关键词召回。

`trigram` 要求查询词至少 3 个字符。更短的查询词跳过 FTS，直接走 `LIKE` 路径，避免返回空结果被误认为“没有相关记忆”。

### 索引

至少建立：

- `story_cards(status, updated_at)`。
- `characters(story_card_id, sort_order)`。
- `abilities(story_card_id, sort_order)`。
- `scenes(story_card_id, sort_order)`。
- `story_nodes(story_card_id, sort_order)`。
- `story_facts(story_card_id, sort_order)`。
- `UNIQUE story_card_versions(story_card_id, version)`。
- `conversations(story_card_id, status, updated_at)`。
- `conversations(status, updated_at) WHERE story_card_id IS NULL`，用于独立存档列表。
- `messages(conversation_id, created_at)`。
- `messages(conversation_id, parent_message_id, created_at)`，用于按父节点列出兄弟版本。
- `UNIQUE messages(conversation_id, client_message_id)`，其中系统和人物消息的 `client_message_id` 为空。
- `UNIQUE messages(generation_id)`，其中玩家消息的 `generation_id` 为空。
- `messages(chapter_id, created_at)`。
- `generations(conversation_id, created_at)`。
- `UNIQUE generations(player_message_id, attempt)`，每次重试增加尝试序号。
- `UNIQUE generations(conversation_id) WHERE status IN ('accepted', 'streaming')`，保证同一对话最多一个活动生成任务。
- `background_jobs(status, available_at)`。
- `UNIQUE background_jobs(source_generation_id, type) WHERE source_generation_id IS NOT NULL`。
- `memories(conversation_id, type)`。
- `state_events(conversation_id, created_at)`。
- `UNIQUE state_events(reverts_event_id) WHERE reverts_event_id IS NOT NULL`。
- `timeline_events(conversation_id, chapter_id, created_at)`。
- `timeline_events(conversation_id, anchor_message_id, created_at)`。
- `runtime_checkpoints(conversation_id, anchor_message_id, created_at)`。
- `story_suggestions(conversation_id, status, created_at)`。
- `UNIQUE conversation_nodes(conversation_id, source_node_id)`。
- `UNIQUE conversation_nodes(conversation_id) WHERE status = 'active'`。
- `knowledge_entries(conversation_id, status, kind)`。
- `UNIQUE chapters(conversation_id, number)`。
- `UNIQUE chapters(conversation_id) WHERE status IN ('active', 'closing')`。
- `director_instructions(conversation_id, status, scope)`。
- `generation_director_instructions(instruction_id, created_at)`。
- `memory_fts` 使用 FTS5 内部索引，不重复创建普通 B-tree 内容索引。

## 七、新建对话

### 请求

```http
POST /api/story-cards/:storyCardId/conversations
Content-Type: application/json
```

```json
{
  "title": "雨夜重逢",
  "sceneId": "scene-id",
  "playerProfileId": "profile-id",
  "playerOverrides": {
    "name": "林舟",
    "occupation": "调查员"
  },
  "abilities": [
    {
      "abilityId": "ability-id",
      "enabled": true,
      "config": {
        "level": 2,
        "uses": 3
      }
    }
  ],
  "modelConfig": {
    "temperature": 0.8
  }
}
```

### 服务端流程

在一个数据库事务中：

1. 读取状态为 `active` 的故事卡及其人物、玩家模板、能力、开场、故事节点和初始事实。
2. 运行确定性故事卡体检；存在 `error` 时返回 `422 STORY_CARD_INVALID`。
3. 校验开场属于当前故事卡。
4. 校验选中的能力属于当前故事卡，并根据 `config_schema` 校验参数、互斥和前置条件。
5. 按“玩家模板 < 玩家档案 < 开场覆盖 < 本次显式覆盖”的顺序合并玩家设定。
6. 锁定字段始终使用故事卡模板值；显式覆盖只允许修改可编辑字段。
7. 生成故事卡、玩家、能力和开场快照，其中故事卡快照包含节点、初始事实、默认状态与状态策略。
8. 由 `default_state_json`、开场标准字段和 `initial_state_json` 按顺序生成初始状态，并用最终状态 Schema 与字段策略校验。
9. 创建对话、第一章、运行时节点和知识簿条目。
10. 根据初始状态与知识簿计算节点的 `locked` 或 `available` 状态。
11. 根据 `opening_sender` 创建属于第一章的开场消息，并创建锚定该消息的初始运行时检查点。
12. 设置当前章节、活动叶节点和活动检查点，提交事务并返回对话详情。

任一步失败都回滚，不留下只有对话但没有开场消息的半成品存档。

当前基线既支持随应用发布的只读示例故事卡，也支持用户创建、体检和发布基础故事卡；内置卡需要先复制为草稿才能编辑。节点和知识簿逻辑仍在第二阶段启用，当前初始检查点只包含静态状态与能力快照，事务边界与失败回滚要求不变。

## 八、对话和模型通信

### 发送消息 API

```http
POST /api/conversations/:conversationId/messages
Content-Type: application/json
Accept: text/event-stream
```

```json
{
  "clientMessageId": "client-generated-uuid",
  "expectedLeafMessageId": "current-leaf-message-id",
  "content": "检查桌上的旧信件。",
  "inputMode": "action",
  "abilityInvocation": {
    "abilityId": "ability-id",
    "input": {
      "target": "旧信件"
    }
  }
}
```

`abilityInvocation` 为可选字段，由能力快捷栏填写；普通消息不发送该字段。`clientMessageId` 用于请求去重。重复提交相同 ID 时返回已有消息及生成状态，不重复写入玩家消息或重复消耗能力。`expectedLeafMessageId` 用于乐观并发控制；当前采用路径已经变化时返回 `409 CONVERSATION_CHANGED`，由用户刷新到最新版本后决定是否重新发送。

### 服务端流程

开始写入前先尝试获取进程级生成许可。达到 `LLM_MAX_CONCURRENCY` 时直接返回 `429 MODEL_BUSY`，不写入玩家消息或生成任务；后续任一步失败都释放许可。

第一段短事务：

1. 校验对话存在且状态为 `active`。
2. 校验 `expectedLeafMessageId` 等于当前活动叶节点。
3. 确认当前对话没有 `accepted` 或 `streaming` 状态的生成任务。
4. 校验当前章节存在且状态为 `active`。
5. 保存属于当前章节的玩家消息，其父节点为当前活动叶节点，默认引用当前运行时检查点。
6. 如果包含 `abilityInvocation`，校验并执行玩家明确发起的能力，写入状态事件、时间线事件和锚定到玩家消息的新检查点；任一步失败则回滚玩家消息和能力消耗。
7. 以玩家消息引用的检查点作为 `base_checkpoint_id` 创建状态为 `accepted` 的生成任务，并把活动叶节点和活动检查点更新为玩家消息对应值。
8. 选择当前适用的导演指令，写入 `generation_director_instructions` 并标记为 `reserved`。
9. 提交事务后发送 `accepted` 事件。

模型调用阶段：

1. 从生成任务的基线检查点读取状态、节点和知识簿，再读取对话快照、章节摘要、记忆、适用导演指令和当前消息路径。
2. 按上下文预算组装模型消息。
3. 将生成任务更新为 `streaming`。
4. 在数据库事务之外调用对话快照指定的模型 Provider，并把文本增量转发给前端。

第二段短事务：

1. 再次确认生成任务仍为 `streaming`，且活动叶节点和活动检查点仍分别等于 `expected_leaf_id` 与 `expected_checkpoint_id`。
2. 从 `working_runtime_json` 创建结果检查点；没有结构化变化时直接复用基线检查点。
3. 保存属于当前章节的完整人物或旁白消息，其父节点为对应玩家消息，写入本次 `generation_id` 并关联结果检查点。
4. 将结果检查点物化为对话当前状态，将生成任务更新为 `completed`，记录 usage 与上下文估算。
5. 把预留导演指令关联更新为 `applied`，消费一次性指令，保留仍有效的章节和对话指令。
6. 把活动叶节点和活动检查点更新为回复消息对应值，同时更新对话的 `updated_at`。
7. 在同一事务中按需写入摘要、事实、节点或状态变化建议的 `background_jobs`，提交后唤醒任务调度器。

模型生成可能持续数分钟，期间不得持有 SQLite 写事务。用户取消、连接断开或模型失败时终止上游请求，把生成任务更新为 `cancelled` 或 `failed`，丢弃模型工具的运行时工作副本并释放预留的导演指令；玩家消息及玩家明确提交的能力结果保留并显示“等待重试”，模型错误不写成故事消息。

同一对话一次只允许一个活动生成任务。不同对话是否并行由全局 `LLM_MAX_CONCURRENCY` 控制，超过限制的请求返回明确的忙碌状态，不在内存中无限排队。

### 取消与恢复

- 浏览器主动停止或离开页面时请求取消接口，服务端中止对应上游请求。
- 进程退出前尽量把活动任务标为 `cancelled`。
- 应用启动时将残留的 `accepted`、`streaming` 任务标为 `failed`，释放其预留导演指令，错误码为 `SERVER_RESTARTED`；不尝试续接模型进程中的旧流。
- 对未得到回复的玩家消息执行重试时，创建新的 generation attempt，不重复写入玩家消息。
- 对最后一轮已经得到回复的消息执行“重新生成”时，创建新的候选版本，不覆盖原回复；失败时继续采用原版本。

### 版本操作与派生

重新生成、编辑重试、选择版本和派生请求都必须携带 `operationId` 与 `expectedLeafMessageId`。`operationId` 在同一对话内唯一，用于处理浏览器重试；活动叶节点变化时返回 `409 CONVERSATION_CHANGED`，不能在旧页面上静默改写新剧情。

- `regenerate` 只接受当前活动叶节点对应的最后一条人物回复，以其父玩家消息的检查点为生成基线。新版本成功后才原子切换活动叶节点和检查点。
- `edit-and-retry` 只接受最后一轮玩家消息，创建同一父节点下的新玩家版本，并以原玩家消息之前的检查点为基线。生成失败时保留原采用路径。
- `active-version` 只允许选择当前最后一轮的兄弟版本，且目标之后不能已有玩家消息；切换时恢复目标版本的运行时检查点。
- `fork` 可以接受任意历史消息。服务复制来源对话快照、目标所在路径截至该消息的内容和该消息引用的运行时检查点，重建章节边界与新 ID 映射；新对话随后完全独立。目标缺少有效检查点时返回 `409 CHECKPOINT_UNAVAILABLE`，不能使用来源对话的当前状态代替。

普通重试继续使用原玩家消息和原能力结果，不再次执行 `abilityInvocation`。重新生成、编辑重试和原地版本选择都禁止作用于已关闭章节；已关闭章节只能派生新对话。

### SSE 事件

```text
event: accepted
data: {"playerMessageId":"...","generationId":"..."}

event: delta
data: {"generationId":"...","text":"她拿起"}

event: completed
data: {"generationId":"...","message":{"id":"...","sender":"character","content":"..."}}

event: state
data: {"generationId":"...","state":{...}}

event: error
data: {"generationId":"...","code":"MODEL_UNAVAILABLE","message":"模型 Provider 不可用","retryable":true}
```

所有事件都包含同一个 `generationId`。前端忽略已取消或不属于当前生成任务的增量。

不要把模型错误伪装成人物消息保存到故事历史中。

由于原生 `EventSource` 只能发 GET，请求端使用 `fetch` 发送 POST，再通过 `ReadableStream` 和 `eventsource-parser` 解析 SSE。`TextDecoder` 必须使用流式模式，正确处理一个事件跨多个数据块、一个数据块包含多个事件以及 UTF-8 字符被拆分的情况。业务组件只接收已经解析和校验的事件对象，不直接处理文本分块。

## 九、上下文组装

### 组装顺序

```text
1. 应用级行为与输出规则
2. 故事卡快照：背景、世界规则、叙事风格
3. 按当前叙述角色过滤后的事实和知识
4. 按关键词和条件召回的故事卡内世界书资料
5. 当前在场人物：身份、性格、目标和允许知道的信息
6. 玩家快照：身份、关系、目标和属性
7. 已启用能力：效果、限制和当前参数
8. 当前章节、场景、活动节点和经过校验的故事状态
9. 固定记忆、相关事实和较早章节摘要
10. 当前分支上、截止到本次玩家消息之前的最近消息，以及锚定在该路径上的时间线事件
11. 当前有效的导演指令
12. 带输入模式标记的本次玩家消息，仅加入一次
```

提示词组装只读取对话快照及该对话的运行时数据，避免故事卡编辑造成同一对话前后设定不同。只注入活动节点和少量可用节点提示，不把完整节点图或全部隐藏秘密放进每次请求。

故事卡内 Lorebook 是背景资料召回层：条目进入对话快照后，生成前按启用状态、故事/场景/人物/章节作用域、结构化条件、当前玩家输入、场景文本和在场人物关键词匹配，命中后作为独立 `story.lorebook.matched` block 注入。它不同于事实系统，不代表当前人物已经知道，也不自动成为已确认真相。服务端提供召回诊断接口，用于解释 `disabled`、`scope_not_matched`、`condition_not_matched` 和 `keyword_not_matched`；另提供召回质量诊断，把 Lorebook、固定记忆和章节回顾按同一输入做轻量词项评分，并明确标记背景资料、已确认记忆和章节摘要边界。

导演指令使用独立、明确标记的上下文分段，优先级低于应用规则、世界规则、知识簿中的已确认事实、已命中的世界书资料和受保护状态。它只改变叙事方式，不作为历史消息，也不能被摘要服务自动提取为事实。

### Token 预算

不再使用固定的“最近 N 条消息”作为唯一限制。请求预算为 `min(MAX_CONTEXT_TOKENS, 模型上下文长度) - RESERVED_OUTPUT_TOKENS`，其中先保留 5% 给消息角色标记、工具定义和 provider 序列化开销，其余才是内容预算。仅给优先级不够，必须给每段配额，否则设定类内容会挤掉全部对话历史。

按 32768 上下文、2048 输出预留计算，可用约 30720 token。当前开发实现先保留 5% 请求封装安全余量，再给各业务 block 设置上限；这些比例是每段的独立上限，不是必须合计为 100% 的静态切分，未用满的额度会留给历史消息。

| 分段 | 上限比例 | 超出处理 |
|------|------|----------|
| 应用规则 | 5% | 不可丢弃，超出即报错 |
| 世界规则与叙事约束 | 10% | 不可丢弃，超出即报错 |
| 玩家快照 | 5% | 不可丢弃，超出即报错 |
| 当前场景 | 5% | 不可丢弃，超出即报错 |
| 动态故事状态 | 8% | 按状态记录裁剪 |
| 在场人物设定 | 12% | 按在场顺序截断次要人物 |
| 结构化事实 | 8% | 保留公开事实和当前在场人物知情的秘密 |
| 世界书召回 | 8% | 保留本轮关键词与条件命中的背景资料 |
| 故事节点机会池 | 8% | 保留进行中和当前可触发节点 |
| 已启用能力 | 5% | 保留当前可用能力 |
| 固定记忆与摘要 | 10% | 先丢较早章节摘要，`pinned` 最后丢 |
| 声明式 MOD | 5% | 保留默认启用的提示词贡献 |
| 可信 MOD 与导演贡献 | 12% | 按 MOD 优先级和预算裁剪 |
| 最近消息与时间线事件 | 剩余额度 | 从旧到新丢弃，可用其余分段的剩余额度 |
| 本次玩家输入 | 独立计入 | 不可截断，可以占用可丢弃分段的剩余额度 |
| 请求封装安全余量 | 5% | 不放业务内容 |

不可丢弃分段和本次玩家输入可以借用可丢弃分段的额度，但不能占用输出预留与 5% 请求封装余量；最终仍超出时返回 `422 CONTEXT_BUDGET_EXCEEDED`，明确指出是哪一段过长，不静默截断世界规则、玩家身份或本次输入。这种情况通常说明故事卡正文或单次输入过长，应由故事卡体检和输入框提前警告。

未用满的业务分段额度优先让给本次玩家输入，再让给最近消息。字符估算系数必须可配置并根据上游 usage 校准，不能把“一个汉字固定等于一个 token”作为正确性前提。

- 人物信息根据当前在场人物选择，不把所有无关人物全部注入。
- 导演指令按作用范围加入；已应用的一次性指令不再占用后续预算。
- 较早消息被阶段摘要替代。
- 最近消息从新到旧加入，直到达到该段预算；本次玩家消息从该集合中排除，最后只在独立输入分段加入一次。

模型服务提供上下文能力时，实际预算取“应用配置值”和“模型能力值”的较小者；未提供时以应用配置为准。若服务未提供 tokenizer，使用保守的字符估算并把各分段长度写入 `generations.context_estimate_json`，与上游返回的 `prompt_tokens` 比较以校准系数，不能等上游返回超长错误后才处理。

服务端组装提示词时先把各来源归一为 `PromptBlock`，再编译最终 system prompt 和消息列表。每个 block 记录 `id`、来源、作用域、优先级、预算、估算 token、内容 hash、依赖、是否纳入和裁剪原因；核心规则、故事背景、玩家快照、当前场景和本次玩家输入是 `required`。Prompt profile registry 集中维护 block 顺序、预算比例、显示标签和 profile hash，`/api/prompts` 暴露只读 profile，`/api/prompts/audit` 暴露顺序、必需块、召回顺序和 golden scenario 的确定性检查。真实 prompt snapshot 会通过 golden evaluator 检查 block 存在、included 状态和顺序，避免 registry 与实际 assembly 偏离。动态故事状态会把作者自定义状态、pending 状态建议、能力使用次数和节点进度编译为独立 block；故事卡内 Lorebook 以关键词与条件召回方式注入，未命中时记录 `condition_not_matched`；故事节点以机会池方式注入，已完成或已跳过节点不会继续作为可触发节点出现。`generations.context_estimate_json.promptSnapshot` 保存本次实际编译的 block 快照、最终 system hash、prompt hash、历史消息 ID、预算参数和 profile 信息，用于回放、排查、缓存验证和 prompt golden 回归。

当前内置节奏导演仍以可信 MOD 形式工作，但它不是静态文本：生成前会读取玩家消息绑定的运行时检查点，按 pending 状态建议数量、进行中节点数量和当前消息深度生成本轮导演提示。独立导演指令表、一次性指令预留和消费审计仍是后续能力。

### 人物知识边界

- 公共背景只包含所有在场人物都可以知道的信息。
- 每条知识通过 `known_by_json` 区分玩家、所有人和具体人物。
- 客观事实存在于知识簿不代表当前人物已经知道，提示词必须按当前叙述角色过滤。
- 单次由一个人物回复时，只注入公共信息、该人物已知内容以及当前节点允许揭示的最少秘密。
- 新事实和秘密揭示先写入候选建议，经节点规则或用户确认后才能修改知识簿。
- 多人物同轮生成时，模型仍可能看到所有参与人物的私有信息；提示词约束只能降低泄漏，无法提供强隔离。
- 需要严格隔离时应拆分为每个人物单独的模型调用，属于后续能力。

### 上下文预览

提供只读诊断接口：

```http
GET /api/conversations/:conversationId/context-preview
```

返回上下文分段、估算 token 数和被裁剪内容的统计。人物秘密默认折叠显示，但本地用户可以主动展开。

## 十、能力、状态与故事推进

### 能力配置

新建对话时把能力定义和最终配置一起写入 `ability_snapshot_json`。修改前先确认当前没有活动生成任务，否则返回 `409 GENERATION_ACTIVE`。故事运行中修改能力时：

1. 校验该能力允许中途修改。
2. 根据快照中的 Schema 校验新值。
3. 在事务中更新能力快照、创建运行时检查点并写入一条时间线事件。
4. 仅从下一次模型请求开始使用新配置。

历史消息不因配置变化重新解释。

### 内置能力执行

只有对话快照中已启用、`execution_mode` 为 `builtin_tool` 且存在白名单处理器的能力，才会作为工具提供给模型。

```text
模型请求能力
  → 根据对话快照查找能力
  → Ajv 校验工具参数
  → 校验归属、次数、冷却和前置条件
  → 内置处理器在生成任务的运行时工作副本上更新状态
  → 记录待提交的 state event 和时间线事件
  → Ajv 校验工具结果
  → 把结果返回模型
  → 模型继续生成故事正文
```

模型适配器负责标准工具调用流式事件，`stateService` 负责所有业务判断。工具调用结果先写入 `generations.working_runtime_json`；只有完整故事回复生成成功后，结果检查点、状态事件、时间线事件和人物消息才在一个事务中成为当前版本。生成失败或取消不会消耗能力或改变当前故事状态。

当前模型不支持 `tool_calls` 时，界面仍允许用户主动点击能力。应用先执行内置处理器，再把经过校验的结果作为系统上下文交给模型叙述，不要求模型伪造工具调用。

自动状态提取使用独立的非流式调用，不把 JSON 混入可见故事回复。支持结构化输出时使用 JSON Schema；不支持时要求返回纯 JSON，再解析并通过 Ajv 校验。任何解析或校验失败都只丢弃状态建议，不影响已经保存的故事正文。

### 受保护状态

次数、冷却、关系值、物品数量等结构化数据由应用维护。状态更新只能来自：

- 用户在状态面板中的明确修改。
- 应用执行并校验通过的能力规则。
- 模型提出、再经 Schema 和白名单校验通过的状态建议。

模型文本不能直接写入 `state_json`。状态编辑、能力执行、状态建议创建、状态建议接受和节点进度更新都通过 StateMutation 管线提交：同一事务中校验活动叶节点与检查点、读取当前运行时状态、执行业务 mutation、克隆运行时检查点、写入 `conversation_events` 并返回新的活动检查点。状态相关事件 payload 会保存 `/custom/...` 字段级 diff、patch 和来源，便于诊断；服务端提供状态建议列表和字段保护说明接口，供前端展示 diff、当前值、字段策略和应用管理字段。完整撤销链仍属于后续能力。

### 状态撤销

撤销一条 `state_events` 记录采用补偿写入，不是删除历史：

1. 确认当前没有活动生成任务，否则返回 `409 GENERATION_ACTIVE`。
2. 只允许撤销该对话最新一条尚未被撤销且 `source` 不是 `revert` 的记录，避免中间态叠加造成不可预测结果。
3. 在一个事务中把状态改回该记录的 `before_json`，写入一条 `source` 为 `revert` 的新 `state_events`，并通过 `reverts_event_id` 指向被撤销事件。
4. 写入一条时间线事件，让用户在故事流中看到这次修正。
5. 重新计算受影响的节点可用性和知识揭示条件。

撤销不回退能力消耗次数以外的叙事内容：已生成的故事消息保持原样，撤销只修正结构化状态。跨越节点完成的撤销需要用户先手动把节点改回 `available`。

生成期间拒绝来自其他请求的能力、状态、版本选择和活动叶节点修改。只有绑定到当前 `generation_id` 的内置工具调用可以在校验后更新运行时工作副本，并立即把结果返回同一次模型调用。用户发起其他修改前需要先停止当前生成。

当前开发实现已经支持状态编辑、状态建议、能力确定性状态补丁、统一 StateMutation 提交、动态状态提示词 block、节点状态机、节点机会池注入和对话诊断面板展示。完整自动状态提取、节点完成补丁和知识簿检索仍属于后续建设。

### 故事节点引擎

当前开发实现先把故事卡节点作为动态机会池：运行时按受限条件匹配当前 `state_json`，读取 `custom.nodeProgress` 并跳过已完成或已跳过节点，再把可触发或进行中的节点注入提示词。节点诊断接口会返回 `locked`、`available`、`active`、`completed` 或 `skipped`、条件是否命中、可执行动作、阻塞原因和 reachability 结构。节点进度更新通过统一 StateMutation 管线做活动消息叶与检查点并发校验，写入新检查点和 `node_progress_updated` 时间线事件。当前节点状态机只允许以下状态转换：

```text
locked ⇄ available → active → completed
                       ├────→ skipped
                       └────→ available（取消激活）
```

- 状态、知识簿或节点状态变化后，在同一事务中重新计算受影响节点的可用性，并对条件非空、尚未揭示的知识条目重新求值，为成立者生成 `fact_reveal` 建议。
- 条件失效时，尚未激活的 `available` 节点可以回到 `locked`。`completed` 和 `skipped` 是终态，只有用户明确执行带审计记录的手动修正才能离开终态。
- 同一对话最多一个 `active` 节点；激活新节点前必须完成、跳过或把当前节点取消激活为 `available`。
- 模型提出的激活或完成请求先进入 `story_suggestions`，不能直接更新节点。
- 接受节点完成建议时，在一个事务中重新校验完成条件、应用状态补丁、揭示允许的知识条目、更新节点并重新计算后续节点。
- 跳过节点不执行完成补丁或秘密揭示；需要额外影响时由独立状态操作或其他节点表达。
- 用户手动修正节点时记录来源和前后状态，并写入时间线事件。

### 导演指令生命周期

- 指令类型、作用范围、目标人物或节点必须经过固定 Schema 校验，自由文本限制长度。
- `once` 指令在下一次生成事务中预留，只有生成成功才消费。
- `chapter` 指令只在创建它的章节有效，章节关闭后自动取消。
- `conversation` 指令持续有效，直到用户关闭。
- 生成过程中新增的指令只影响下一次生成；已预留指令不能编辑，只能先取消生成。
- 导演指令不进入消息、摘要、FTS 或知识簿，也不能修改事实和受保护状态。

### 章节关闭

关闭章节采用两段式流程：

1. 获取模型工作许可，再用短事务确认没有活动生成任务，把当前章节设为 `closing`，固定当前活动叶节点为章节结束消息。
2. 在事务外根据当前分支的章节消息生成标题、摘要及事实、节点和状态变化建议。
3. 短事务保存可编辑摘要和状态快照，将章节设为 `completed`，创建下一章并更新 `current_chapter_id`。
4. 提取出的事实、节点和状态变化写入 `story_suggestions`，不随摘要自动提交。

章节处于 `closing` 时拒绝发送新消息。摘要生成失败后恢复为 `active`，用户可以调用重试接口，或在请求中直接提供手写摘要跳过模型调用完成关闭。应用启动时也把残留的 `closing` 章节恢复为 `active`。章节关闭不删除、改写或重新挂接原消息。

### 故事卡体检

确定性体检由 `lintStoryCard` 纯函数执行，不调用模型，结果结构统一为：

```ts
interface StoryLintIssue {
  severity: 'error' | 'warning' | 'suggestion'
  code: string
  path: string
  message: string
}
```

确定性检查覆盖必填字段、重复 ID、跨卡引用、节点条件、不可达节点、事实与人物引用、状态路径、能力处理器、JSON Schema 和估算上下文预算。没有任何开场或存在多个默认开场属于 `error`；存在开场但没有默认开场属于 `warning`。`error` 允许保存草稿，但禁止发布或基于该版本新建对话；`warning` 和 `suggestion` 不阻止使用。

可选 AI 审阅只在用户主动执行时运行，用于发现人物动机矛盾、故事节奏空洞、秘密可能提前泄漏和节点缺少推进价值。AI 审阅结果全部标记为建议，不能修改故事卡、改变 lint severity 或绕过确定性错误。

## 十一、记忆系统

### 记忆类型

| 类型 | 生成方式 | 用途 |
|------|----------|------|
| `pinned` | 用户手动固定 | 每轮都应考虑的重要提醒 |
| `recall` | 从历史消息提取 | 帮助召回的内容，不作为事实真相来源 |
| `summary` | 达到上下文阈值后自动生成 | 压缩较早剧情 |

### 摘要流程

1. 对话历史达到配置阈值。
2. 选择当前消息路径上尚未进入摘要的连续消息区间，并创建带区间哈希的幂等 `background_job`。
3. 调度器取得模型许可后调用模型生成结构化摘要草稿。
4. 再次确认区间仍属于当前路径，保存摘要及覆盖范围，不删除原始消息。
5. 后续上下文只使用覆盖当前路径的摘要，用户仍可查看原文。

摘要失败不阻塞本轮人物回复，由持久化任务按退避规则重试。重新生成或切换版本后，不再位于当前消息路径上的摘要不得注入上下文；用户编辑或锁定的记忆不会被自动覆盖。

### 记忆检索

每次组装上下文的长期目标是：

1. 始终加入当前对话未失效的 `pinned` 记忆。
2. 使用本次输入和当前场景从 `memory_fts` 检索同一 `conversation_id` 下的相关 `recall` 与 `summary`，再按 `source_message_id` 或摘要覆盖区间过滤掉不属于当前消息路径的候选。
3. 加入已 `completed` 章节的章节摘要，较近章节优先。
4. 按来源消息范围和内容哈希去重：某段消息已被章节摘要覆盖时，不再重复注入覆盖同一区间的 `summary` 记忆。
5. 根据记忆 token 预算截断，并记录未采用条目的数量。

摘要只有两个存放位置，用途不重叠：`memories(type='summary')` 保存章节内的滑动窗口压缩，`chapters.summary` 保存已关闭章节的存档摘要。对话表不保存摘要正文。

当前开发实现暂不创建 `memory_fts`。`GET /api/conversations/:id/recall-diagnostics` 使用 RecallSource registry 汇总 Lorebook、固定记忆和章节回顾，使用当前输入做轻量词项评分，只用于解释召回边界和质量，不作为最终长期检索排序方案。响应中暴露当前 lexical engine、source 列表和 FTS5-ready 能力标记；真正的 FTS5 表、触发器和重建流程仍未固定。

第一、二阶段不引入向量数据库。只有故事背景和长期记忆规模增大、FTS5 检索质量经过实际案例证明不足时，才评估 `sqlite-vec`。向量检索需要独立的本地 embedding 模型、明确的 embedding 版本和重建流程，不能假设 DeepSeek 聊天模型提供兼容的 embedding。

## 十二、API 概览

### 故事卡

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/story-cards` | 故事库列表、搜索和状态筛选 |
| POST | `/api/story-cards` | 创建故事卡 |
| GET | `/api/story-cards/:id` | 故事详情及子项 |
| PATCH | `/api/story-cards/:id` | 按版本更新故事卡 |
| POST | `/api/story-cards/:id/publish` | 体检通过后把草稿发布为可用故事卡 |
| POST | `/api/story-cards/:id/archive` | 归档可用故事卡 |
| POST | `/api/story-cards/:id/unarchive` | 恢复已归档故事卡 |
| POST | `/api/story-cards/:id/duplicate` | 复制故事卡 |
| POST | `/api/story-cards/lint` | 检查尚未保存的故事卡草稿 |
| POST | `/api/story-cards/:id/lint` | 检查已保存版本，可选执行 AI 审阅 |
| POST | `/api/story-cards/import/json` | dry-run 检查或导入 Storybound JSON 故事卡包、SillyTavern V2 角色卡 |
| DELETE | `/api/story-cards/:id` | 将草稿或已归档故事卡移入回收站 |

故事卡导入入口保持单一 API，但服务端内部按 `normalizeStoryImport`、`detectStoryImportFormat` 和 adapter `inspect` 管线处理。当前 adapter 包括 Storybound 自有故事卡包和 SillyTavern V2 角色卡；unsupported 格式只返回 dry-run 报告和确定性错误，不进入草稿创建。新增外部格式时优先添加 adapter，不改主导入事务。

### 玩家档案

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/player-profiles` | 获取玩家档案 |
| POST | `/api/player-profiles` | 创建玩家档案 |
| PATCH | `/api/player-profiles/:id` | 更新玩家档案 |
| DELETE | `/api/player-profiles/:id` | 删除玩家档案；来源引用置空，旧对话快照不受影响 |

### 对话

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/conversations?source=detached` | 获取来源故事卡已删除的独立存档 |
| GET | `/api/story-cards/:id/conversations` | 获取故事卡的对话列表 |
| POST | `/api/story-cards/:id/conversations` | 新建对话并生成快照 |
| GET | `/api/conversations/:id` | 获取对话、状态和当前分支 |
| PATCH | `/api/conversations/:id` | 重命名；请求携带 `metadataVersion` 用于并发控制 |
| POST | `/api/conversations/:id/complete` | 把进行中对话标记为已完成 |
| POST | `/api/conversations/:id/resume` | 恢复已完成对话 |
| POST | `/api/conversations/:id/archive` | 归档并记录归档前状态 |
| POST | `/api/conversations/:id/unarchive` | 恢复到归档前状态 |
| DELETE | `/api/conversations/:id` | 移入回收站 |
| GET | `/api/conversations/:id/messages` | 按当前分支和游标读取消息 |
| GET | `/api/conversations/:id/branches` | 获取消息分支树、当前路径和派生来源 |
| POST | `/api/conversations/:id/messages` | 发送消息并流式生成回复 |
| POST | `/api/messages/:id/retry` | 为未得到回复的玩家消息创建新生成尝试 |
| POST | `/api/messages/:id/edit-and-retry` | 编辑最后一轮玩家消息并创建替代版本 |
| GET | `/api/generations/:id` | 查询生成任务状态 |
| POST | `/api/generations/:id/cancel` | 取消活动生成任务 |
| POST | `/api/conversations/:id/regenerate` | 为最后一轮人物回复生成替代版本 |
| GET | `/api/conversations/:id/reply-candidates/compare` | 获取最后一轮候选的比较数据 |
| POST | `/api/conversations/:id/active-version` | 选择最后一轮的已有版本并恢复其运行时检查点 |
| POST | `/api/conversations/:id/fork` | 从任意历史消息派生独立新对话 |
| PUT | `/api/conversations/:id/state` | 更新故事状态 |
| GET | `/api/conversations/:id/state-hints` | 获取状态字段、当前值和保护原因 |
| GET | `/api/conversations/:id/state-suggestions` | 获取状态变化建议及字段级 diff |
| POST | `/api/conversations/:id/state-events/:eventId/revert` | 撤销一次状态变更 |
| GET | `/api/conversations/:id/state-events` | 查看状态变更历史 |
| PATCH | `/api/conversations/:id/abilities` | 更新允许中途修改的能力 |
| GET | `/api/conversations/:id/context-preview` | 查看模型上下文诊断 |

### 导演与故事推进

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/conversations/:id/director-instructions` | 获取当前导演指令 |
| POST | `/api/conversations/:id/director-instructions` | 创建导演指令 |
| PATCH | `/api/director-instructions/:id` | 修改尚未预留或持续有效的指令 |
| DELETE | `/api/director-instructions/:id` | 取消导演指令 |
| GET | `/api/conversations/:id/nodes` | 获取节点进度和当前可用节点 |
| POST | `/api/conversations/:id/nodes/:nodeId/activate` | 激活可用节点 |
| POST | `/api/conversations/:id/nodes/:nodeId/deactivate` | 把当前活动节点取消激活为可用 |
| POST | `/api/conversations/:id/nodes/:nodeId/complete` | 校验并完成节点 |
| POST | `/api/conversations/:id/nodes/:nodeId/skip` | 跳过允许跳过的节点 |
| GET | `/api/conversations/:id/lorebook-diagnostics` | 诊断当前场景和输入下的世界书召回 |
| GET | `/api/conversations/:id/recall-diagnostics` | 诊断 Lorebook、固定记忆和章节回顾的召回边界与轻量相关性 |
| GET | `/api/conversations/:id/chapters` | 获取章节列表 |
| POST | `/api/conversations/:id/chapters/close` | 关闭当前章节并保存摘要 |
| POST | `/api/conversations/:id/chapters/current/close/retry` | 摘要生成失败后重试，或直接以手填摘要关闭 |
| PATCH | `/api/chapters/:id` | 编辑并锁定章节标题或摘要 |
| GET | `/api/conversations/:id/knowledge` | 获取经过剧透权限过滤的知识簿 |
| POST | `/api/conversations/:id/knowledge` | 用户新增知识条目 |
| PATCH | `/api/knowledge/:id` | 修改内容、知情范围或状态 |
| GET | `/api/conversations/:id/suggestions` | 获取待确认的故事变化建议 |
| POST | `/api/suggestions/:id/accept` | 重新校验并接受建议 |
| POST | `/api/suggestions/:id/reject` | 拒绝建议 |

知识簿接口默认只返回玩家当前已知内容。`includeHidden=true` 需要前端明确进入剧透模式后发送；这是单人本地产品的体验保护，不是安全边界。

### 记忆与数据

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/conversations/:id/memories` | 获取记忆 |
| POST | `/api/conversations/:id/memories` | 固定一条记忆 |
| PATCH | `/api/memories/:id` | 编辑或锁定记忆 |
| DELETE | `/api/memories/:id` | 删除记忆 |
| POST | `/api/assets` | 上传封面或头像，返回数据目录内的相对路径 |
| GET | `/api/trash` | 查看回收站中的故事卡与对话 |
| POST | `/api/trash/:type/:id/restore` | 从回收站恢复 |
| DELETE | `/api/trash` | 清空回收站并物理删除，执行前自动备份 |
| POST | `/api/backups` | 创建本地备份 |
| GET | `/api/prompts` | 查看当前服务端 Prompt profile |
| GET | `/api/prompts/audit` | 查看 Prompt profile 审计和 golden scenario 定义 |
| GET | `/api/export` | 导出故事卡、对话或完整数据 |

回收站恢复严格使用各记录保存的删除前状态。清空时，故事卡模板子项按外键级联删除，仍存在的对话把 `story_card_id` 置空并转入“独立存档”；删除对话则级联删除其消息、章节、检查点、事件、记忆和任务。执行物理删除前必须先完成一次可校验的一致性备份，备份失败时不执行删除。

### 模型

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/models` | 获取模型列表、健康状态和已知能力 |
| POST | `/api/models/:id/probe` | 由用户主动执行工具和结构化输出能力探测 |

统一错误格式：

```json
{
  "error": {
    "code": "ABILITY_CONFIG_INVALID",
    "message": "能力配置不符合故事卡规则",
    "details": {
      "field": "level"
    }
  }
}
```

## 十三、模型适配

应用通过 OpenAI-compatible API 连接本地或远程模型 Provider。应用只消费已运行的模型服务，不负责启动、停止、重启或下载模型。

使用的基础接口：

```text
GET  {LLM_BASE_URL}/models
POST {LLM_BASE_URL}/chat/completions
```

模型适配器提供统一接口：

```ts
interface LlmAdapter {
  listModels(signal: AbortSignal): Promise<ModelInfo[]>
  capabilities(model: string, signal: AbortSignal): Promise<ModelCapabilities>
  streamChat(input: ChatInput, signal: AbortSignal): AsyncIterable<ChatChunk>
  complete(input: ChatInput, signal: AbortSignal): Promise<ChatResult>
  health(): Promise<ModelHealth>
}

interface ModelCapabilities {
  streaming: boolean
  toolCalls: boolean
  structuredOutput: boolean
  reasoningContent: boolean
  usage: boolean
  contextWindow?: number
}
```

- `streamChat` 用于人物回复。
- `complete` 用于摘要和后续的结构化状态提取。
- `listModels` 用于启动检查和设置页模型选择。
- `capabilities` 决定工具、结构化输出和上下文预算是否可用。
- OpenAI-compatible 的请求、SSE 解析和错误映射只存在于适配器内部。
- 服务层不能依赖 DeepSeek 或某个推理服务器的私有响应字段。

当前 `openAiCompatibleAdapter` 使用原生 `fetch` 和严格 SSE 解析实现。项目自己的 `ChatInput`、`ChatChunk` 和错误码仍是内部契约，不能把某个 Provider 的 wire 类型传播到 Service、数据库或前端。

适配器测试必须覆盖普通流式文本、UTF-8 分片、严格 `[DONE]`、截断、取消、超时、错误响应、`reasoning_content`、usage、工具调用和结构化输出。若目标服务的流格式不兼容，只替换适配器内部实现，不修改上层领域接口，也不同时保留两套运行时依赖。

### 能力发现

OpenAI-compatible 只说明接口形状相近，不代表模型一定支持工具调用、JSON Schema 或 usage。能力来源按以下优先级合并：

1. 服务端显式配置的能力覆盖值。
2. 用户在设置页主动执行并确认的能力探测结果。
3. `/models` 返回的模型元数据。
4. 未知能力默认关闭。

探测结果按 `baseURL + model` 缓存，并记录探测版本和时间；基础地址、模型或适配器版本变化后失效。启动健康检查不能自动发送会生成文本的探测请求。`toolCalls` 为 false 时不向模型发送 tools；`structuredOutput` 为 false 时不使用 provider 的 JSON Schema 模式。

### 请求约束

- 前端只能引用已保存的 Provider，不能在生成接口中临时提交任意地址或密钥。保存 Provider 时只允许 `http:` 与 `https:`；非回环的明文 HTTP 默认拒绝。
- 服务端禁止携带凭据跟随跨源重定向。用户显式标记为本地 Provider 时只允许回环地址；远程 Provider 禁止环回、链路本地和私网目标。
- 密钥存入独立凭据表，Provider API 只返回 `hasCredential`。生成任务快照保存端点、模型、思考设置和凭据引用，不保存密钥明文。
- 请求只发送标准 `messages`、`model`、`stream` 和经过白名单过滤的生成参数。
- 连接超时与流式空闲超时分开计算；收到文本增量后重置空闲计时器。
- 用户取消时通过 `AbortSignal` 中止上游请求。
- 上游 `429`、显存不足、上下文过长、连接失败和格式错误必须映射成稳定的应用错误码。

### 模型工作调度

所有模型调用共享 `workScheduler` 和 `LLM_MAX_CONCURRENCY`，优先级从高到低为：

1. 用户正在等待的故事回复和能力叙述。
2. 用户主动发起的章节摘要、AI 体检和能力探测。
3. 自动记忆摘要与故事变化提取。

交互请求不在内存中无限排队；繁忙时返回可重试状态。后台任务只在有空闲许可时运行，繁忙时在 `background_jobs` 中保持 `pending`，不抢占正在生成的故事回复。任务领取使用短事务从 `pending` 转为 `running`，完成和失败均持久化，不能只依赖进程内队列。

### 响应归一化

- 流式响应读取 `choices[0].delta.content`，收到 `[DONE]` 后正常结束。
- 非流式响应读取 `choices[0].message.content`。
- `reasoning_content` 保留为可配置能力：不作为故事正文展示或写入消息表；仅保存 token 数等诊断遥测，不持久化完整思考文本，也不写日志。
- 上游只有推理内容而没有正文时返回 `MODEL_EMPTY_RESPONSE`，允许用户重试。
- 保存前验证最终正文非空，并限制单条回复的最大字符数。
- 无法解析的增量只记录脱敏诊断信息，不把原始响应写入故事历史。

以后需要接入 Ollama 原生接口或其他运行时，应新增适配器，而不是在 `chatService` 中加入提供商分支。

## 十四、本地运行与安全

- 服务默认只监听 `127.0.0.1`，不监听所有网卡。
- 前后端生产环境同源，不设置通配符 CORS。
- 监听地址不是回环地址时必须设置 `ACCESS_TOKEN`，否则拒绝启动并给出明确原因。启用后所有 `/api` 请求校验令牌，界面明确提示局域网暴露风险。
- 限制 JSON 请求体和导入包大小，分别由 `MAX_IMPORT_BYTES` 和框架级 body 限制控制。
- 封面和导入文件只能写入应用数据目录，路径必须规范化并校验。
- 上传只接受 PNG、JPEG 和 WebP，按嗅探到的真实文件头判断而不是相信扩展名或 `Content-Type`。存储文件名由服务端生成 UUID，不使用客户端文件名。数据库只保存数据目录内的相对路径，读取时拒绝规范化后越出数据目录的路径。
- 日志不记录完整提示词、人物秘密和聊天正文；诊断日志需要用户主动开启。
- 运行中的 SQLite 备份必须使用 SQLite Online Backup API 或 `VACUUM INTO` 获得一致性快照，不能直接复制可能仍有 WAL 内容的 `story.db` 文件。
- 当前用户可见备份使用 `VACUUM INTO` 写临时文件并原子重命名，只包含 SQLite 一致性快照。资源打包、覆盖恢复、校验清单与 Schema 版本仍是后续目标，不属于当前实现。
- 数据库物理删除和覆盖恢复前必须创建可恢复备份。

## 十五、配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `HOST` | `127.0.0.1` | 服务监听地址 |
| `PORT` | `3001` | 服务端口 |
| `ACCESS_TOKEN` | 空 | 非回环地址监听时必须设置，空值时拒绝以非回环地址启动 |
| `LLM_BASE_URL` | `http://127.0.0.1:8000/v1` | 首次启动时创建的 OpenAI-compatible Provider 地址 |
| `LLM_API_KEY` | `local-ds4` | 首次 Provider 的可选密钥，只写入服务端凭据存储 |
| `LLM_MODEL` | `deepseek-v4-flash` | 首次 Provider 的默认模型名称 |
| `LLM_FIRST_TOKEN_TIMEOUT_MS` | `30000` | 连接后等待首个有效增量的超时 |
| `LLM_TOOL_CALLS` | `auto` | `auto`、`true` 或 `false`，覆盖工具调用能力 |
| `LLM_STRUCTURED_OUTPUT` | `auto` | `auto`、`true` 或 `false`，覆盖结构化输出能力 |
| `LLM_MAX_CONCURRENCY` | `1` | 全局并行生成上限 |
| `LLM_CONNECT_TIMEOUT_MS` | `5000` | 连接模型服务的超时 |
| `LLM_IDLE_TIMEOUT_MS` | `120000` | 流式响应无新数据的超时 |
| `MODEL_HEALTH_CACHE_TTL_MS` | `30000` | Provider 健康探测的进程内缓存时间，最小 1000ms |
| `RUNTIME_MAINTENANCE_INTERVAL_MS` | `60000` | 清理过期模型健康缓存的间隔，最小 1000ms |
| `PROVIDER_HEALTH_INTERVAL_MS` | `0` | 后台轮询所有 Provider 的间隔；`0` 表示关闭，启用时最小 10000ms |
| `AUTO_BACKUP_INTERVAL_MS` | `0` | 后台创建 SQLite 一致性备份的间隔；`0` 表示关闭，启用时最小 60000ms |
| `SSE_HEARTBEAT_MS` | `15000` | 向浏览器生成流发送注释心跳的间隔 |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | 优雅停机超过此时间后强制退出 |
| `DB_PATH` | `./data/story.db` | SQLite 路径 |
| `DATA_DIR` | `./data` | 图片、导出和备份目录 |
| `WEB_DIST_PATH` | `./apps/web/dist` | 生产模式下 Web 静态资源目录 |
| `MAX_JSON_BODY_BYTES` | `32768` | 普通 JSON 请求体上限 |
| `MAX_STORY_DRAFT_BYTES` | `1048576` | 故事卡编辑与体检请求体上限 |
| `MAX_CONTEXT_TOKENS` | `32768` | 应用允许使用的默认上下文上限 |
| `RESERVED_OUTPUT_TOKENS` | `2048` | 为回复预留的 token |
| `MAX_MESSAGE_CHARS` | `8000` | 单条消息允许保存的最大字符数 |
| `MAX_UPLOAD_BYTES` | `5242880` | 单个封面或头像文件上限 |
| `MAX_IMPORT_BYTES` | `52428800` | 导入包上限 |
| `AUTO_SUMMARY` | `true` | 是否自动生成阶段摘要 |
| `MEMORY_SEARCH` | `fts` | `fts`、`like` 或 `none`，控制相关记忆检索 |

模型参数以“全局默认值 < 故事卡默认值 < 对话快照值”的优先级合并。运行中的对话修改参数只影响后续生成。

### 当前缓存策略

- Provider 健康探测由 `llm` Service 按完整 Provider 快照键缓存 30 秒，最多保留 100 项；相同探测的并发请求共享同一 Promise。Provider 修改、删除或显式检查时失效或强制刷新，后台维护任务定期清理过期项。
- Token 粗估结果最多保留 2048 项；故事卡、玩家与模型快照组成的静态提示词上下文最多保留 200 个对话。两者都是单进程内 LRU 风格缓存，不保存凭据或完整生成结果。
- 浏览器端只缓存明确的 GET 数据，最多 100 项，并合并相同的在途请求。所有普通写请求和生成 SSE 建立后都会使缓存失效；失效前发出的慢 GET 不能回填旧值。
- `/api` 响应统一发送 `Cache-Control: no-store`，避免浏览器、代理或共享 HTTP 缓存持有本地私密数据。当前单机架构不引入 Redis；若未来出现多进程部署，再根据一致性需求重新评估共享缓存。

### 当前后台任务

- `backgroundTasks` 使用 `ctx.effect()` 注册 timer，Provider 健康检查不会重叠执行；Fiber 卸载时清理 timer 并等待在途检查结束，不会在热重载或停机后残留。
- 过期健康缓存维护默认启用；Provider 主动轮询和自动 SQLite 备份默认关闭，只有配置对应间隔后才运行。
- 自动任务失败只增加运行时失败计数并写日志，不终止 HTTP 服务，也不改变故事事务结果。

### 当前章节与记忆范围

在不调整数据库结构的前提下，手动章节回顾与固定消息记忆保存在 `runtime_checkpoints.state_json.custom`，每次修改都会克隆检查点并校验活动消息叶与检查点。结束章节会完成现有 `chapters` 记录并创建下一章，回顾和固定记忆参与后续提示词预算。

这一实现不等同于长期设计中的自动摘要任务、可编辑记忆实体、FTS 检索或运行时知识簿，也没有引入 Schema 版本。故事卡内 Lorebook 只作为对话快照中的背景资料召回层，不承担跨存档记忆检索或事实揭示事务。数据库版本号、迁移链和跨版本自动恢复继续明确延期。

## 十六、开发与打包

### 开发模式

```bash
bun install
bun run dev
```

`dev` 同时启动 Vite 和 Express。前端开发服务器将 `/api` 代理到 `http://127.0.0.1:3001`。

`dev` 不启动模型服务。当前 Provider 不可用时，故事卡和存档管理仍可使用；发送消息前显示明确的模型离线状态。

### 数据库结构

开发期启动时直接执行 `apps/server/src/db/schema.ts` 中的当前完整结构。它只负责创建全新数据库并检查必要字段，不维护数据库版本，也不会自动升级旧结构；结构不匹配时应重建本地开发数据库。

2026-08-17 起，当前开发结构要求 `story_cards` 包含动态状态与结构化故事内容字段：`state_schema_json`、`default_state_json`、`state_policy_json`、`facts_json`、`lorebook_entries_json`、`nodes_json` 和 `declarative_mods_json`；`abilities` 包含 `config_schema_json`、`input_schema_json`、`result_schema_json` 和 `runtime_json`。这只是开发期结构标记，项目尚未正式使用真实数据；正式开始使用前，再决定是否保留、清空或重新初始化本地库。旧开发库缺少这些字段时不会自动迁移，应先确认数据价值再处理。

同日开发结构也要求 `conversation_events.kind` 允许 `node_progress_updated`，用于节点激活、取消激活、完成和跳过的时间线审计。旧开发库如果只缺 CHECK 枚举而不缺列，也按开发库重建处理，不做迁移。

本轮 P7-P10 新增的是前端诊断面板、导入适配、召回质量诊断和 Prompt audit；随后补齐的 StateMutation 管线、prompt golden 评估、RecallSource 抽象、节点状态机和 import adapter pipeline 也未新增持久化表。数据库仍按当前开发结构整体重建，不写正式 migration，也不把当前库视为正式起点。

最近一次开发库重建发生在 2026-08-17：旧 SQLite 三件套已移动到 `data/rebuild-backups/story-db-20260817T053748Z`，新库通过当前初始化入口生成，`PRAGMA quick_check` 为 `ok`。这仍只是开发期重处理记录，不固定为正式 baseline。

推荐的本地重建方式是移动旧 SQLite 三件套，再调用当前初始化入口：

```bash
mkdir -p data/rebuild-backups/story-db-YYYYMMDDTHHMMSS
mv data/story.db data/story.db-shm data/story.db-wal data/rebuild-backups/story-db-YYYYMMDDTHHMMSS/
bun --eval "const { initializeDatabase } = await import('./apps/server/src/db/initialize.ts'); initializeDatabase();"
```

### 构建

```bash
bun run build
bun run compile
```

- `build` 在 `apps/web/dist/` 生成前端静态资源，并完成所有 workspace 的 TypeScript 检查。
- `compile` 将服务端编译为 `build/storybound`。前端 `apps/web/dist/` 仍需与可执行程序一同分发；它不是单文件程序。
- 运行后访问 `http://127.0.0.1:3001`。

```bash
bun run build
bun run compile
NODE_ENV=production ./build/storybound
```

## 十七、测试重点

### 单元测试

- 玩家模板、开场覆盖、玩家档案和显式覆盖值的合并顺序。
- 锁定字段不可被覆盖。
- 空动态对象 Schema 必须是关闭对象；字段策略中的路径必须能在对应 Schema 中解析。
- 默认状态、开场标准字段和开场状态覆盖的合并顺序。
- 能力参数范围、互斥和前置条件。
- 动态 JSON Schema 拒绝外部 `$ref`、未知字段和类型强制转换。
- 故事状态只允许白名单更新。
- 节点条件 DSL 的组合、深度限制和合法状态转换。
- 故事卡体检发现跨卡引用、不可达节点和无效能力处理器。
- Lorebook 条目的关键词、条件、优先级、禁用状态和预算裁剪。
- 导演指令的作用范围和适用章节计算。
- 上下文分段顺序、配额分配和 token 裁剪优先级。
- 当前玩家输入只在最终模型请求中出现一次，请求封装余量不被业务分段占用。
- 不可丢弃分段超出预算时报错而不是截断。
- 消息树当前路径解析，以及同一父消息下多个兄弟版本的排序。
- OpenAI-compatible 流式增量、`[DONE]` 和错误响应解析。
- `reasoning_content` 不进入故事正文。
- 模型能力关闭时不发送 tools 或结构化输出参数。

### 集成测试

- 同一故事卡创建两次对话后消息完全隔离。
- 修改故事卡后旧对话仍使用原快照。
- 新建对话任一步失败时事务完整回滚。
- 重复 `clientMessageId` 不产生重复消息。
- 重复能力快捷操作不重复消耗次数或应用状态补丁。
- 同一对话的第二个活动生成请求被拒绝。
- `expectedLeafMessageId` 过期时不写入消息。
- 模型流式生成期间其他 SQLite 写入不被长事务阻塞。
- 模型超时、断开和用户取消时保留玩家消息且不保存错误人物消息。
- 模型工具执行后若生成失败或取消，不提交工作副本中的能力消耗和状态变化；玩家主动提交的能力结果仍保留。
- 服务重启后残留生成任务被标记为可重试失败。
- 服务重启后残留后台任务恢复为 `pending`，重复领取不产生重复摘要或建议。
- 一次性导演指令只在生成成功后消费，失败和取消后可以重试。
- 节点完成时状态补丁、知识揭示和后续节点重算原子提交。
- 章节摘要失败后章节恢复为 `active`，且不丢失消息。
- 知识簿默认响应和人物上下文不包含未授权秘密。
- 摘要失败不影响正常对话。
- FTS5 检索只返回当前对话的记忆，并能在索引丢失后重建。
- 内置能力处理器拒绝未启用能力、无效参数和未知 `handler_key`。
- 重新生成产生同一父消息下的新兄弟消息，原回复不被覆盖。
- 选择最后一轮版本时同时恢复对应运行时检查点；已有后续消息时拒绝原地切换。
- 时间线事件能按当前路径展示，但不会改变消息树父子关系或活动叶节点。
- 已关闭章节内的消息拒绝重新生成和编辑重试，派生新对话使用目标检查点且不影响来源存档。
- 删除玩家档案后旧对话仍可打开；物理删除故事卡后对话变为独立存档；删除来源对话后派生对话仍可打开。
- WAL 存在并持续有读取时创建的备份仍能通过 `quick_check`，恢复后数据库版本、引用图片和校验哈希一致。
- 撤销状态变更写入补偿事件，且不修改历史记录与故事正文。
- `trigram` 不可用时自动降级为 `like` 检索并在设置中可见。

### 端到端测试

第一阶段的端到端流程：

```text
选择内置示例故事卡
  → 使用默认开场新建对话并填写玩家基本信息
  → 模型离线时看到明确状态并保留输入
  → 发送对话、行动和旁白
  → 重新生成一条回复
  → 编辑玩家消息后重试
  → 返回故事详情
  → 继续原对话
  → 创建第二次独立对话
```

第二阶段补充：

```text
复制内置故事卡并修改人物、玩家模板、能力和开场
  → 查看并手动修改状态
  → 使用一次性导演指令和能力快捷栏
  → 激活并完成一个故事节点
  → 确认一条事实揭示建议
  → 撤销一次状态修改
  → 关闭章节并编辑摘要
```

桌面和移动视口都需要检查故事卡内容、配置表单、消息输入区和状态抽屉不存在遮挡或溢出。

### 模型评测

Promptfoo 评测与确定性测试分开执行：

```bash
bunx promptfoo eval -c evals/promptfooconfig.yaml
```

评测至少覆盖：

- 人物语气、目标和关系是否保持一致。
- 人物是否泄漏其不应知道的秘密。
- 导演指令是否被当成玩家台词或故事事实复述。
- 节点未满足条件时模型是否擅自推进。
- 玩家身份和锁定字段是否被模型尊重。
- 未启用能力是否会被擅自使用。
- 工具不可用时是否采用正确降级路径。
- 长对话摘要后是否保留关键约定。
- 状态建议是否满足 JSON Schema。

评测只在用户主动执行时连接已配置的模型 Provider，默认并发为 1，不由测试命令启动模型服务。评测数据不包含真实私人对话，结果保存模型名、提示词版本和关键参数，便于修改提示词后比较回归。

## 十八、实施顺序

### 第一阶段

1. 建立当前数据库结构、Repository 和共享 Zod Schema，只创建示例故事、对话、章节、消息、生成任务及基础检查点所需的表；上线前直接维护当前结构，不预建未验证的全部表。
2. 写入至少两张只读示例故事卡，并实现故事库和详情页。
3. 实现 OpenAI-compatible 适配器、严格 SSE、思考模式、健康检查和错误归一化。
4. 实现简化的新建对话配置、不可变快照和自动创建第一章。
5. 实现按 `conversation_id` 隔离的消息版本、生成任务、POST SSE 客户端和基础流式聊天。
6. 实现上下文组装与分段配额，确保当前玩家输入只加入一次，并保存 token 估算。
7. 实现故事页面、停止生成、失败重试、最后一轮重新生成和最后一条玩家消息编辑重试。
8. 实现自动保存、启动恢复、模型离线状态，以及用户主动触发的 SQLite 一致性备份。
9. 实现本地/远程 Provider 管理、不可变凭据版本和按存档选择模型。
10. 实现基础故事卡编辑、确定性体检、发布与内置卡复制。
11. 完成第一阶段端到端流程和基础模型评测，再扩展动态状态与节点引擎。

### 第二阶段

1. 增加动态 Schema、字段策略及运行时事件所需表结构，实现 Ajv 编译器并扩展现有故事编辑器。
2. 实现默认状态和开场覆盖的高级编辑与校验。
3. 实现故事节点、条件 DSL、进度重算和故事变化建议。
4. 实现知识簿、秘密揭示、揭示条件求值和人物知情范围。
5. 实现故事状态面板、运行时检查点、时间线事件、状态历史与撤销。
6. 实现能力快捷栏、能力运行状态、内置工具工作副本及无工具模型的 UI 降级路径。
7. 实现导演面板、指令预留与作用范围。
8. 实现持久化后台任务、章节关闭、摘要、FTS5 检索和上下文预览。
9. 实现故事卡可选 AI 审阅、多人物发言及 Promptfoo 基线评测。

### 第三阶段

1. 实现多版本并排比较、检查点切换与从任意历史消息派生新对话。
2. 实现故事卡和对话 JSON 导入导出。
3. 实现可选的结构化状态建议提取。
4. 根据真实检索质量决定是否加入 `sqlite-vec` 和独立 embedding 模型。
5. 增加故事卡版本比较、用户可见的备份和存档恢复工具。
6. 评估可复用世界书与人物原型库，并保持对话快照边界不变。
