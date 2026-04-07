# OpenClaw 与 Cursor 记忆体系 — 运行手册（Runbook）

> **用途**：沉淀本机 AI 基建与记忆维护方式，供人类与 OpenClaw 向量检索使用。  
> **安全**：本文**不包含**任何 API Key、网关 Token、飞书密钥；一律用环境变量或私密配置。

---

## 1. 两套「记忆」各自管什么

| 体系 | 是什么 | 适合存什么 | 不适合存什么 |
|------|--------|------------|--------------|
| **Cursor** | 当前对话上下文 + 项目规则（如 `.cursorrules`） | 架构原则、当次任务、@ 引用的文件 | 指望聊天永久记住一年前细节 |
| **OpenClaw Memory** | 本地 SQLite + 向量（`memory index`）+ 可选关键词 | `MEMORY.md`、`memory/*.md`、以及配置的 **Markdown 扩展路径** | 密钥、token、可被索引的明文机密 |

**配合方式**：原则写进 **Cursor 规则 / 契约**；事实与操作步骤写进 **Markdown 文档树**，再由 OpenClaw **索引**；需要时用 `openclaw memory search` 检索后贴回对话。

---

## 2. 本机 OpenClaw 关键配置（摘要）

### 2.1 配置文件

- 主配置：`~/.openclaw/openclaw.json`
- 网关日志：`~/.openclaw/logs/gateway.log` / `gateway.err.log`
- 记忆库（内置引擎）：`~/.openclaw/memory/main.sqlite`
- OpenClaw **工作区**（代理默认 `MEMORY.md`、`memory/`）：`~/.openclaw/workspace/`

### 2.2 嵌入（Embedding）与网络

- **本地嵌入**：`agents.defaults.memorySearch.provider` 使用 **`local`**（`node-llama-cpp` + GGUF）。需要 **Node ≥ 22.14，推荐 24**（本机可用 Homebrew `node@24`）。
- **Hugging Face 下载**：CLI/首次拉模型若长时间停在 **「Gathering information」**，多为 **HF 拉取卡住**。解决：设置 **`HF_ENDPOINT=https://hf-mirror.com`**（与网关一致），并保留本机 **HTTP(S) 代理**；Node 侧需 **`NODE_USE_ENV_PROXY=1`** 才会使用环境变量中的代理。
- **模型缓存**：`~/.node-llama-cpp/models/`（`embeddinggemma` 等 GGUF）。

### 2.3 网关（LaunchAgent）

- plist：`~/Library/LaunchAgents/ai.openclaw.gateway.plist`
- 典型环境：代理、`NODE_USE_ENV_PROXY=1`、`NODE_OPTIONS=--dns-result-order=ipv4first`、`HF_ENDPOINT`、`OPENAI_BASE_URL` / `OPENAI_API_BASE` 指向兼容端（如 GMI）以减轻错误默认域名影响。
- 重载：`launchctl kickstart -k "gui/$(id -u)/ai.openclaw.gateway"` 或 `bootstrap`（按当时系统提示操作）。

### 2.4 已知的网络/DNS 问题（排障）

- 若 **`api.openai.com`** 解析到 **Meta/Facebook 段等非 OpenAI IP**，直连会超时或异常。处理：**修正 DNS/污染**，或 **统一走可信代理 + 正确 `OPENAI_API_BASE`**，勿依赖被污染的默认域名。

### 2.5 GMI 等 OpenAI 兼容端与嵌入

- 部分兼容端对 **`text-embedding-3-small`** 等模型返回 **404 / No matching target**。若坚持用远程嵌入：需向服务商确认 **可用的 embedding 模型名** 并在 `memorySearch` 中配置；否则继续用 **local** 嵌入。

---

## 3. WeGO 与向量索引（extraPaths）

在 `openclaw.json` 的 `agents.defaults.memorySearch.extraPaths` 中配置了 **绝对路径**（避免扫入 `agent/.venv` 等）：

- `WeGO/docs/`（递归 `.md`）
- `WeGO/WeGO_Technical_Solution.md`、`WeGO_Development_Plan.md`、`WeGO_Product_Proposal.md`、`README.md`
- `WeGO/agent/prompts/`

**重要**：OpenClaw 内置索引 **只收录 `.md`**（及可选多模态配置），**不索引 `.js`**。  
若需检索 **Edge Function 实现**，使用 **`docs/route-ingest-implementation.md`**（指向 `server/functions/route-ingest/index.js`）。

---

## 4. WeGO route-ingest（与记忆的关系）

- **源码**：`server/functions/route-ingest/index.js`（Deno 薄代理 → `BACKEND_API_URL` + `/api/route-ingest/*`）。
- **契约**：`contracts/route-ingestion.schema.json`。
- **发布清单**：`docs/route-upload-release-checklist.md`。
- **实现说明（可检索）**：`docs/route-ingest-implementation.md`。

---

## 5. 维护清单（建议节奏）

### 每次改文档/设计后

```bash
export HF_ENDPOINT=https://hf-mirror.com
# 若需代理：
export HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 NODE_USE_ENV_PROXY=1
PATH="/usr/local/opt/node@24/bin:$PATH" openclaw memory index --force
```

### 抽查检索

```bash
openclaw memory search "关键词" --max-results 5
openclaw memory status
```

### Shell 登录默认带 HF 镜像

`~/.zshrc` 中已建议：`export HF_ENDPOINT=https://hf-mirror.com`（与网关一致）。

### 安全

- **禁止**把密钥写进会被 `extraPaths` 索引的 Markdown。
- 若密钥曾出现在聊天或日志中，**轮换**并检查 `openclaw.json`、LaunchAgent、`.zshrc` 中的导出。

---

## 6. 插件与全局安装注意

- **微信插件**等若报 **`resolvePreferredOpenClawTmpDir` / `channel-config-schema` 缺失**：多为 **OpenClaw 与插件版本不匹配** 或 **全局 `node_modules` 被非 npm 方式改写**（如用 pnpm 往全局包目录装依赖）。按官方方式 **重装/对齐版本** 后再跑 `openclaw plugins doctor`。

---

## 7. Cursor 侧维护（无自动 API）

- **项目规则**：本仓库 `.cursorrules`（架构、契约、原子任务）。
- **用户级规则**：Cursor 设置中的 User Rules（全局偏好）。
- **本手册**：`docs/openclaw-and-cursor-memory-runbook.md`（事实与运维）。

若 Cursor 提供「Memories」类功能，可将上述 **1～2 条最高层原则**手工录入；细节仍以本文与 `docs/` 为准。

---

## 8. 相关文档索引

| 主题 | 路径 |
|------|------|
| route-ingest 实现（MD） | `docs/route-ingest-implementation.md` |
| 发布与迁移 | `docs/route-upload-release-checklist.md` |
| 契约与 Path2 | `docs/path2-contract-mapping.md` |
| 总体技术方案 | `WeGO_Technical_Solution.md` |

---

## 9. 每周约 30 秒检查清单（人工自查）

> 目的：让 **文档 / 规则 / 向量索引** 三者别脱节；**默认不自动执行**，靠你每周扫一眼或设日历提醒。

1. **这周有没有改 `docs/` 或 `~/.openclaw/workspace/memory/`？**  
   - 有 → 记下是否需在 runbook 或内部记忆里补一句；**无则跳过**。

2. **原则有没有变（架构、契约、禁止事项）？**  
   - 有 → 改 **`.cursorrules`** 或契约文件；**无则跳过**。

3. **若本周动过会被索引的 Markdown**（含 `extraPaths` 下的 WeGO 文档）：  
   - 终端执行一次（环境变量按你本机习惯带上 `HF_ENDPOINT`、代理等）：  
     `openclaw memory index --force`  
   - 可选抽查：`openclaw memory search "本周关键词" --max-results 3`

---

## 10. 这份清单会「自动触发」吗？

**不会。**  
把清单写进本文，只是给你（和 AI）一个**固定查阅位置**；**Cursor、OpenClaw 默认都不会**因为日历翻页就帮你跑命令或改文件。

若你希望**到点提醒**（仍由你决定是否执行第 3 步），可自行任选其一：

| 方式 | 说明 |
|------|------|
| **系统日历 / 提醒事项** | 每周重复事件，标题写「OpenClaw 记忆周检」+ 链到本文件路径。 |
| **cron / launchd** | 定时执行脚本里写 `openclaw memory index --force`（注意代理与 `HF_ENDPOINT`）；适合**只想自动刷新索引、不管文档**的场景。 |

**不建议**在未确认网络/代理的情况下用定时任务盲跑 `index`，以免占满 CPU 或长时间卡住。
