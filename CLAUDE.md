# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **强制工程与 UI 规范见 [AGENTS.md](AGENTS.md)**（Claude Code 会自动加载，改代码前必读；冲突时以它为准）。
> 本文件只补充 AGENTS.md 没有的内容：命令速查、架构大图、跨文件才能拼出的链路与约定、守卫脚本与坑点。
> 详细的模块目录、IPC 全通道表见 [docs/README.md](docs/README.md)（§2.2 目录结构、§3 IPC、§4 AI 核心、附录 Key File Index），中文镜像 [docs/README.zh-CN.md](docs/README.zh-CN.md)。

Electron + React 19 + TypeScript + Zustand 桌面端 Agent 工作台。主进程 `electron/`，渲染层 `src/`，三种模式 Chat / Work / Code，另有 Python 与 TypeScript 两套 SDK。

## 常用命令

```sh
npm run electron:dev      # 编译主进程 + Vite + Electron；主进程改动必须重启，渲染层走 HMR
npm run electron:compile  # 仅编译 electron/ → dist-electron/（同时产出 preload bundle）
npm run dev               # 只起渲染层（纯浏览器，window.electronAPI 为空，走 ai-service.ts 回退）
npm run build             # 全量构建 + electron-builder 打包
npm run cli:run -- "<任务>"  # 无头单次执行（= electron dist-electron/main.js --run，见「无头模式」）

npm test                  # vitest 全量
npm run test:watch        # watch 模式
npm run test:coverage     # 全量 + coverage/coverage-summary.json（设置面板「测试覆盖率」页读同一份文件）
npm run test:backend      # = vitest run electron/ipc
npm run test:frontend     # = vitest run src

npx vitest run electron/ipc/__tests__/agent-handlers.test.ts   # 单文件
npx vitest run src/stores/__tests__/useChatStore-flow.test.ts -t "用例名"  # 单个用例
npx vitest run electron/ipc                                    # 单目录

npm run test:smoke        # 真实 Electron 跑 dist/ 生产渲染层，验 electronAPI 与 6 条 IPC 通道
npm run test:e2e          # Playwright 驱动真实 Electron（含注册/登录/重启链路）
npm run sdk:build && npm run sdk:test && npm run sdk:test:py && npm run sdk:smoke
npm run sdk:check:py      # Python SDK 全检：ruff + pyright + unittest
npm run eval:agent:dry    # 只验数据集与 grader（无需 key）；去掉 :dry 跑真实模型，需 DEEPSEEK_API_KEY
npm run eval:diff         # 与冻结基线比对判回归；--check-meta 只比工具 schema 指纹（无需 key）
npm run eval:prompt-ab    # 提示词变体 A/B：evals/prompts/*.txt 各跑一遍评测 + 基线臂对比
npm run format:check      # Prettier 校验（CI 阻断项，但**不在** npm run check 里）
node scripts/ui-preview.mjs  # 一次性 UI 截图：先在另一终端 npm run dev，用系统 Chrome 渲染并截图（非 e2e、不进 CI）

npm run check             # 本地全量门禁，9 步：
                          # lint → lint:budget → check:cycles → check:runtime-boundary
                          # → electron:compile → check:preload-bundle → tsc6 --noEmit -p tsconfig.json
                          # → test → check:docs
```

**`npm run check` 全绿 ≠ CI 全绿**：CI 还跑 `npm run format:check`、`npm audit --audit-level=high`、`node scripts/agent-eval.cjs --dry`、`node scripts/eval-diff.cjs --check-meta`、`npm run sdk:check:py`、SDK smoke、E2E，以及（仅 Linux）覆盖率门禁。改完推之前按需补跑这几条。

**工具链坑**：`typescript` 被 alias 成 `npm:@typescript/typescript6@6.0.2`，bin 名是 **`tsc6`**。一律用 `npx tsc6`，**不要**用全局 `tsc`，也不要把类型检查换成 `tsc -p`。
首次运行需要 `.env`（`Copy-Item .env.example .env`）并填 `DEEPSEEK_API_KEY`，否则真实评测与模型调用不可用；安全相关开关也都写在 `.env.example` 里（注释即文档）。

**`node_modules` 文件级损坏（真实事故，别当成上游问题）**：`npm install` 不校验已装文件的完整性，一次被中断的安装会留下"包目录在、文件缺一半"的包 —— 本仓库实测过：pptxgenjs 少了整个 `types/`（表现为 tsc 报 TS7016）、rxjs 少 98 个文件、minizlib 有个文件被截成 0 字节，而且 `npm install` 永远修不好它们（`package.json` 在解压顺序里排得很前，npm 认为"已装好"）。判定：`npm pack <pkg>@<版本>` 下载官方 tarball 与本地 `diff -rq`；**不要**急着往 `electron/vendor.d.ts` 加 `declare module`（那里只放上游本来就不发类型的包）。根治只有 `npm ci`，且**必须先停掉 `npm run electron:dev`**（Vite 持有 lightningcss 原生模块，Windows 上会让 ci 的删除阶段 EPERM 中途失败，留下一棵被删掉一半的树）；`npm ci` 还会跳过可选依赖 `better-sqlite3`，装完要确认它在（`node -e "require('better-sqlite3')"`）。

## 架构大图：一轮对话的完整链路

```
src 输入框 → useChatStore.sendMessage（src/stores/chatSendMessage.ts）
   ├ Chat 模式      → ai.chatStream  → electron/ipc/ai-handlers.ts（无工具，纯对话）
   └ Work / Code    → ai.sendQuery   → electron/ipc/ai-handlers.ts
                                        ├ 查询路径 → electron/ipc/query-engine.ts
                                        └ Agent / SDK / ACP → electron/ipc/agent-handlers.ts:runSubAgent
                                        └ 多 Agent 队列 → electron/ipc/agent-scheduler-*.ts
     → agent-runtime/agent-loop-driver.ts:agentLoopRun   （外层循环：迭代预算 / 停止策略 / 质量门 / Replan 拦截）
         → agent-runtime/step-engine.ts:runStep          （一次 ReAct 迭代）
             nudge 注入 → 上下文装配 + UserPromptSubmit hook
             → invokeLlmWithRetry（429/5xx/ECONNRESET 退避重试，随后一次 fallbackModel）
             → runToolBatch：agent-runtime/tool-runner.ts
             → 无工具调用则交由 agent-runtime/agent-loop-stop.ts:stopPolicyEvaluate 判停
             → maybeCompact（agent-runtime/context-manager-compact.ts，超阈值触发压缩）
     ← 事件回传 → src/stores/chatSendEvents.ts（RAF + 节流缓冲）写入 store → 选择器驱动重渲染
```

- 引擎文件全在 `electron/agent-runtime/`：`agent-loop-driver.ts`（外层循环）、`step-engine.ts`（单步）、`context-manager*.ts`（上下文装配/压缩）、`llm-adapter.ts` + `llm-provider-{format,anthropic,openai,responses}.ts`（协议适配与工具 schema 规范化）、`tool-runner.ts`（工具批）。
- **系统提示词与工具 schema 必须字节稳定**（缓存前缀），`context-manager.ts:STATIC_SYSTEM_PROMPT` 里禁止出现 `Date.now` / 随机数 / 环境变量；动态内容一律放前缀之后。
- 停止策略、压缩、重试、质量门都是 step-engine 的**策略钩子**，不允许在别处再写一套循环。

## 引擎边界（最容易踩的架构红线）

- `electron/agent-runtime/**` 是纯引擎：**禁止**对 `electron/ipc/**` 有**值**依赖（`import type` 可以）。守卫 `npm run check:runtime-boundary`（CI 阻塞）。
- 新增宿主能力的正确顺序：在 `electron/agent-runtime/ports.ts` 的 `RuntimePorts` 里声明 → 在 `electron/ipc/runtime-ports.ts` 装配实现。桌面、无头 CLI、SDK 与测试共用同一份装配。
- 三个宿主入口的分工不要混：`ipc/query-engine.ts`（Chat 外的查询路径）、`ipc/agent-handlers.ts`（Agent 工具 / SDK / ACP 的子 Agent）、`ipc/agent-scheduler-*.ts`（队列、并发、暂停续跑、快照持久化）。
- `surface: 'chat'` 在上游就被拒（`ipc/ai-handlers.ts`、`ipc/agent-scheduler.ts`），Chat 没有工具面。
- 迭代预算只能经 `electron/ipc/agent-iteration-budget.ts:resolveIterationBudget()` 解析，渲染层禁止自带默认值。

## 工具执行管线：顺序即安全模型

`electron/agent-runtime/tool-runner.ts` 只是门面，真实的门禁顺序在 `electron/ipc/tool-handlers/pipeline.ts:executeToolCall`，**不可绕过、不可调序**：

```
Work 文档门（electron/work-docs-policy.ts）
→ 路径卫生（electron/ipc/path-security.ts：敏感路径拒绝 + 物理路径边界）
→ 权限 profile（electron/permission-profile.ts）
→ 沙箱门（electron/sandbox-policy.ts，拒绝模型自行提权）
→ 项目规则（electron/rules.ts，默认不授权）
→ 审批（electron/ipc/permission-handlers.ts）
→ worktree 重定向 → 备份 / 冲突锁 → PreToolUse hook → 执行器
→ 结果缓存 + PostToolUse hook
```

- 能力集合（读/写/Shell/终端/危险/Work 禁用/受限不支持）的**单一事实源**是 `electron/tool-capability.ts`，禁止在别处重复维护同名字符串集合。
- 工具表由 `electron/tool-provider.ts` 按 builtin → MCP → plugin 顺序拼接，总量 96 封顶（超了截断并告警）。MCP / 插件工具声明 `semanticsKnown: false`，危险判定 / 并发安全 / 沙箱一律按最严处理；**判「是不是外部来源工具」只能调 `isExternalSourceTool()`**，别自己写 `startsWith('mcp__')`（前缀知识集中在 `tool-provider.ts`，只有派发那一处才直接解析前缀）。
- 子进程环境一律走 `electron/safe-env.ts` 白名单；`RunCode` 里的 `await tools.Name(...)` 子调用也必须回穿同一条管线。
- 沙箱 **fail-closed**：原生沙箱启动失败必须拒绝执行，绝不退化成无沙箱。
- 新增工具必须**同时**改 `electron/tool-defs/`、`electron/ipc/tool-handlers.ts` 的 registry、必要的门禁（详见 AGENTS.md）；漏一处会出现「模型看得到工具但调用失败」。
- **动态工具装载**（`electron/agent-runtime/tool-catalog.ts:selectToolsForTask`）按分组正则预选工具表，两条方向相反的安全边界都不能破：只做「少给」不做「多给」（ToolSearch 的组名白名单），但也**不许据名字静默丢弃**（`mcp__*` 与一切未归类名字由 `retainByDefault` 保留 —— 这是修过一次的真回归）。新增内置工具必须能被 `GROUP_MATCHERS` 归类（`electron/__tests__/tool-catalog.test.ts` 会红），且要想清楚它要不要进 `LEARNED_CORE_TOOLS`，否则默认只靠任务文本信号才会加载。

## 工具面的扩展（插件 / MCP / 技能 / 工作流）

- **渲染层插件没有工具扩展点**：`src/core/plugin-loader.ts` 只提供命令 + hooks + UI（声明 `tools` 会被忽略并告警），装的时候做危险模式扫描 + 确认框。能给模型加工具的只有两个来源：MCP，和主进程动态插件（`MountPlugin` → `electron/ipc/dynamic-plugin.ts`，vm 白名单执行，明确不是 OS 沙箱）。动态插件、`RunCode`、内联工作流三者共用同一把闸 `unsafeCodeEnabled()`：`AURAXIS_ALLOW_UNSAFE_CODE=1` **且** `AURAXIS_PACKAGED !== '1'` —— 打包版永远关着。
- **MCP**：配置是渲染层 zustand（`auraxis-advanced-storage` 的 `mcpServers`）经 `mcp:setServers` 推给主进程，连接只存在内存里、**不会开机自动连**；密钥一律进 safeStorage 凭据库（`MCP_TOKEN_<ID>`、OAuth 工件），**配置里不放密钥**（配置要进 localStorage）。策略集中在 `electron/ipc/mcp-handlers.ts`：stdio 命令白名单 + 禁 `-e/-c` 之类参数、HTTP 只允许 https（回环豁免）、默认拒绝内网与云元数据地址。工具名 `mcp__<serverId>__<tool>`。
- **三个都叫「技能」的东西**：① 斜杠命令 —— 静态表 `src/constants/commands.ts` + 插件命令，经 `src/utils/slashCommands.ts` 合成同一份列表供自动补全 / 执行 / 命令面板三处共用；② Agent 技能 —— `src/core/skills.ts` 硬编码若干条，经 `src/core/agent-launch.ts`（UI 侧唯一的 `createAgent` 入口）起子 Agent；③ SKILL.md 技能 —— 磁盘 `userData/skills` 里的文件，模型用 `ListSkills`/`ReadSkill` 读，`WriteSkill` 写前过 `electron/skill-gate.ts`。改任一处先确认改的是哪一个。
- **工作流**：定义从 `userData/workflows` 与 `<project>/.auraxis/workflows` 读（`.json` 与 `.md`，md 里每个 `##` 是一步）；每次运行前 `topoOrder` 校验重复 id / 未知依赖 / 环；步骤作为独立调度 Agent 跑，默认 `autoApprove=false` 且用无人值守审批器（无窗口 = 拒绝）。实现见 `electron/workflow-engine.ts`。

## 会话与记忆

- 会话是 **append-only 事件流**：唯一词表 `electron/contracts/session-types.ts`，存储实现 `electron/session-store.ts`（JSONL + 投影缓存），聊天与 Agent 共用。**禁止再开私有持久化格式。**
- 跨进程类型放 `electron/contracts/`，`electron/types.ts` 与 `src/types/*` 一律 re-export，禁止三处各写一份。
- 记忆：`electron/ipc/memory-db.ts` 单例，SQLite（`auraxis-memory.db`）为主、JSON 回退，存证据 / 信号 / 信念 / 审计。

## 无头模式 / SDK / ACP

- 入口 `electron/main.ts` 在 `app.whenReady()` 后解析 CLI（`electron/cli-args.ts`）并分流：桌面窗口 / `--run` / `--sdk` / `--acp` / 插件 CLI。无头分支跳过单实例锁并使用独立 Chromium profile。
- `electron/headless-run.ts:runHeadlessTask` 复用 `agentLoopRun`；默认只放行只读工具，除非 `--auto-approve`。verbose 时往 stderr 打 `[工具集] n= hash=` 与 `[用量] … cacheHit/cacheMiss` —— 这是判断「缓存前缀有没有被击穿」的观测点，改系统提示词或工具顺序后先看它。
- SDK 与 ACP 复用子 Agent 链路：`electron/sdk-server.ts`（回环 TCP，端口与 token 打到 stdout —— 因为 Windows 无法给 Electron 主进程定向 stdin）、`electron/acp-server.ts`（stdio JSON-RPC）。自动批准分别受 `AURAXIS_SDK_AUTOAPPROVE` / `AURAXIS_ACP_AUTOAPPROVE` 约束。
- `Agent` 工具的 `backend: 'fork'` 是第四条路径：`electron/fork-runner.ts` 另起一个 `electron . --run … --json` 子进程（带超时与输出上限），跑飞了也污染不到父回合的上下文。

## 渲染层

- **没有路由器**。导航即状态：`useAppStore` 的 `sidebarMode`、`activeToolView`、`rightPanelView`（右栏可分栏，第二栏是 `rightPanelView2`）、以及**会话历史** `sessionHistory`（顶栏左上角 ← →：主区固定单标签、标签历史已废弃，记录点订阅 `currentSessionId`，导航在 `src/hooks/useSessionHistory.ts`）。新增界面多半是加一个 view key / tab type（`src/types/chat.ts`）并在 `src/components/layout/WorkbenchContent.tsx` 注册，而不是加路由。右面板能力注册表在 `src/workbench/workbench-panels.tsx`（每项声明 `availability(ctx)`，能力不足时渲染带原因的锁定态，不要放假面板）。
- **Activity 视图是纯投影**：`src/core/activity/**` 把 `messages[].toolCalls` / AgentLog 投影成聊天区的执行流程（纯函数，因而落在覆盖率门禁内）。「工具输出 → 卡片」的提取只有一份（`src/core/activity/agentCards.ts`），渲染只有一份（`src/components/agent/ToolOutputCard.tsx`）—— 历史上这三份提取逻辑漂移过，别再在组件里写第二份；新增 `ActivityType` 时 `src/core/activity/presentation.ts` 的 `Record<ActivityType, …>` 表会逼你归类，漏接即编译失败。
- **Store 约定是「工厂注入」，不是 slice**：`useChatStore.ts` 等只持有 state + persist 配置，动作 / 缓冲 / 副作用拆在同目录的 `createXxx(deps)` 工厂模块里，用 `set`/`get` 注入后 spread 进 initializer（目的是断循环依赖 + 可单测）。chat 的运行时状态（`abortController`、IPC 订阅、看门狗超时）刻意放在 `src/stores/chatStreamRuntime.ts` 的**模块级单例**，不进 React state。
- **IPC 边界**：契约唯一来源 `src/types/electron-api.ts`，文件末尾有与 preload 的类型漂移守卫。`window.electronAPI` 是**可选**的（纯浏览器回退），调用点一律 `?.`；没有统一 wrapper 层，组件直接调（例外：`src/services/ai-service.ts`、`agentStoreHelpers.agentIpc()`）。
- **流式回传**：没有全局 token 通道。每次请求注册回调并返回订阅，事件经 `chatSendEvents.ts` 节流后写 store。
- **样式三处同源（真实维护陷阱）**：`src/styles/tokens.css`、`src/styles/app.css` 的 `@theme` 块、`src/styles/theme.ts`（antd `ThemeConfig`）各自硬编码同一套调色板。改色必须三处同改，否则 utility class 与组件库会打架。
- **图标**：只从 `src/components/common/icons.tsx` 导入（lucide 兼容层，沿用 Phosphor 命名），禁止直接 `import 'lucide-react'`；`IconContext` 的 `size: '1em'` 是硬要求。
- **持久化**：各 store 的 `partialize` 才是真正的持久化契约；版本号 bump 必须配 `migrate`（bump 不得让 hydration 变砖）；与主进程对账（权限预设、玻璃能力、API key 状态）放 `onRehydrateStorage`。
- **i18n（新增 UI 文案的固定动作）**：`src/i18n/zh-CN.ts` 是 key 的唯一事实源（`I18nKey = keyof typeof zhCN`），`en-US.ts` 声明为 `Record<I18nKey, string>` —— 漏英文 key 直接编译失败。组件用 `useT()`，非 React 代码用 `t()`；key 是点分命名空间（`settings.*`、`mcp.*`）。**未知 key 静默回落成 key 字符串本身**，不报错，所以拼错只会看到界面上一串 `foo.bar`。模型面文本（系统提示词、工具描述）刻意不翻译，本来就是写死的中文。

## 模式边界（Chat / Work / Code）

- `sidebarMode` 存于 `useAppStore`；跨能力边界切模式会跳到该模式最近的会话（`src/stores/sessionModeSwitch.ts`）。
- 三处隔离同时生效：会话按模式打标、`chatStoreSideEffects.ts` 按模式快照 thinking / plan 偏好、`useAgentStore` 按 surface 记 `lastAgentIdBySurface`。
- 主进程侧硬边界：Work 由 `electron/work-docs-policy.ts` 拒绝一切代码文件的写/改/删；Chat 无工具、无右面板、无终端。

## 测试约定

- 全局 `environment: 'node'`（`vitest.config.mts`）。React / 组件用例在**文件首行**用 `// @vitest-environment jsdom` 逐文件 opt-in。
- `src/test/setup.ts` 提供 `ResizeObserver` / `matchMedia` polyfill，并在 `afterEach` 清理 antd 静态 portal —— `message` / `Modal.confirm` 在 `act` 外的延迟任务是 jsdom teardown 噪声的主因。
- 依赖 `electron` 的模块用 `vi.mock('electron', ...)`；需要跨用例 `mockClear()` 时用 `vi.hoisted()` 先建 mock 对象。纯逻辑优先抽成可测函数，而不是去 mock Electron。
- 新用例放模块旁的 `__tests__/`，命名 `<module>.test.ts` 或 `<topic>-<aspect>.test.ts`。
- 覆盖率只统计 `electron/**`、`src/stores/**`、`src/core/**`；`electron/main.ts` 与 `electron/preload*.ts` 明确排除（由 E2E / smoke / headless CLI 覆盖）。四项阈值均 80。**文档里的覆盖率与用例数字以 `coverage/coverage-summary.json` 与 `check-doc-stats` 为准，不要凭记忆写。**
- `vitest.config.mts` 显式 `minWorkers: 1` / `maxWorkers: 4`：沙箱、PTY 这类拿真实进程的用例在默认并发下会被饿死（表现为「2 秒超时却 10 秒没杀完进程树」），不要为了跑得快去调大。
- 仓库根的 `test1/**`、`demo-*/**` 是被 vitest `exclude` 的演练项目（agent 自己生成过的东西），在里面写用例不会被收集。
- smoke 与 E2E 一律在临时目录里起应用：`mkdtempSync` + `AURAXIS_USER_DATA_DIR` 及各 `AURAXIS_*_DIR`，需要跳过登录门时再加 `AURAXIS_AUTH_DISABLED=1`（`auth-flow.e2e.ts` 例外 —— 它要的就是真实注册/登录链路）。加新用例时照抄这套，别让测试写进真实 userData。

## 守卫脚本与 CI 门禁

改完代码前先跑 `npm run check`。以下守卫各自拦一类事故，**不要把它们的失败当成误报**：

| 守卫                             | 拦什么                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check:cycles`           | `electron/` 与 `src/` 的静态 import 环。预算全 0：值环、运行时环、含 `import type` 的环都不允许（`--list` 打印断边）                                |
| `npm run check:runtime-boundary` | 引擎对 `electron/ipc/**` 的值依赖（见「引擎边界」）                                                                                                 |
| `npm run check:preload-bundle`   | `dist-electron/preload.js` 缺失、不含 `contextBridge`、或 require 了拆分模块。历史事故：tsc 静默失败 → `window.electronAPI` 为 undefined → 无法登录 |
| `npm run lint:budget`            | ESLint warning 预算为 0。复杂度 30 / 嵌套 5 / 函数 220 行 / 文件 800 行是 warning 级但计入预算，新代码不得新增该面                                  |
| `npm run check:docs`             | `check-doc-parity`（docs 中英 1–3 级标题数必须一致）+ `check-doc-stats`（版本号 / 测试数 / 覆盖率声明互查）                                         |

- **改任何文档数字前先跑 `npm run check:docs`**：`check-doc-stats.cjs` 会校验测试文件数、用例数、`v3.5.0` 版本串（含 SDK 与 pyproject 版本一致）、以及形如 `NN.NN% lines` 的覆盖率声明与实测相差不超过 0.6pp，并禁止旧数字残留。文件数与用例数是**写死在脚本里的当前锚定值**（当前 325 / 2,739）：被扫的五份文档（`README.md` / `AGENTS.md` / `docs/README{,.zh-CN}.md` / `CHANGELOG.md`）里至少一处要写新值，且**任何一处都不许残留旧值** —— 只改一半会红。
- **工具 schema 指纹是 CI 门禁**：`node scripts/eval-diff.cjs --check-meta`（无需 key）比对 `evals/baseline/tool-schema.hash`。动了 `electron/tool-defs/` 的工具 schema 就会漂移，必须用 `--freeze` 重跑冻结并**人工提交**新基线（`evals/baseline/` 里的文件只保留门禁读得懂的字段，轨迹与机器路径在冻结时被投影掉）。
- CI（`.github/workflows/build.yml`）三平台均为阻断项；Linux 额外跑覆盖率门禁、xvfb 下的 SDK smoke 与 E2E。`.github/workflows/sandbox.yml` 为手动触发（Windows 原生沙箱用例默认 skip）。
- `npm run test:coverage` 写入的 `coverage/coverage-summary.json` 是设置面板「测试覆盖率」页的数据源，不是给人看的临时文件。

## 生成物：不要手改，也不要把它们当源码

`dist/`、`dist-electron/`、`release/`、`packages/auraxis-sdk/dist/`、`coverage/`、`evals/reports/`、`evals/candidates/`、`test-results/`、`playwright-report/`、`spill/` 全部可再生，直接删掉重建。

`dist-electron/preload.js` 卡住时：先删掉 `dist-electron/` 再 `npm run electron:compile`。

## 打包（electron-builder.yml）

运行期要读的**非 TS 资源**必须同时进 `extraResources`：`electron/sandbox-{windows,appcontainer}.ps1`、`sandbox-{linux,macos}.sh`（原生沙箱）、`scripts/auraxis-mcp-preload.cjs`（MCP 连接器）、`electron/tokenizer/tokenizer.json`（本地 tokenizer）。漏加的表现是「开发环境一切正常，装出来的包缺文件」。原生依赖（better-sqlite3 / node-pty / ffi-rs）走 `asarUnpack` 解包，`npmRebuild: false`（node-pty 1.x 是 N-API，无需重编译）。

## 与 AGENTS.md 的分工

本文件**不重复** AGENTS.md 的「改动联动检查」清单、「UI 视觉规范」（色板 / 圆角六档 / 单层容器 / 零位移动画 / 字号字重 / 图标档位）、「安全与验证」清单与「模型工具开发约定」。改任何功能前，请按 AGENTS.md 的联动面清单逐项排查（状态入口、请求链路、展示链路、模式联动、持久化迁移、测试）。

另注：**产品自己也会读 `AGENTS.md`** —— `electron/agent-instructions.ts` 按 全局（`userData/AGENTS.md`，目录可用 `AURAXIS_HOME_DIR` 改）→ 项目根 → 逐级子目录 叠加，同目录下 `AGENTS.override.md` 优先，合计上限 32 KiB。所以改本仓库的 AGENTS.md 不只是改给人看的规范，也改产品交给模型的指令。
