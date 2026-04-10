# WeGO 开发日志（Development Log）

> **文档角色**：记录「已经发生的」开发过程、里程碑与关键决策，与 `WeGO_Development_Plan.md`（计划与任务拆解）互补——**计划写要做什么，本日志写做了什么、何时做、与哪些文档/提交相关**。  
> **维护约定**：每次重要功能合入、上线、架构或契约变更时，由负责人**在表格下方追加一条**（保持倒序：最新在上），避免改写历史条目正文。

---

## 1. 相关文档索引

| 类型 | 路径 | 说明 |
|------|------|------|
| 开发计划与 Sprint | `WeGO_Development_Plan.md` | 四层架构、契约摘要、Sprint 0–11 原子任务 |
| 本地运行与排障 | `docs/local-dev-runbook.md` | 启动顺序、端口、常见故障 |
| 固定端口约定 | `.cursorrules` | 前台 5173、后台 5174、API 8787 |
| 新路线发布 SOP | `README.md` | Dry run → Review → Publish → Verify → Rollback |
| 路线入库实现说明 | `docs/route-ingest-implementation.md` | 解析/校验/清洗/入库链路 |
| 发布检查清单 | `docs/route-upload-release-checklist.md` | 上线前检查项 |
| Path2 / 部署 | `docs/path2-ecs-deploy.md`、`docs/path2-cutover-runbook.md` | 部署与切换 |
| 产品与设计 | `docs/product-design/*.md` | 后台路线编辑、路线上传 Agent 等 |
| OpenClaw / 记忆 | `docs/openclaw-and-cursor-memory-runbook.md` | 本机记忆基建索引 |
| URL 清单 | `docs/wego-urls.md` | 环境地址备忘 |

---

## 2. 架构与契约基线（持续有效）

以下内容为当前仓库事实基线，详细字段以仓库内文件为准。

- **四层物理解耦**：`src/`（前端 UI）、`server/`（迁移与 API）、`agent/`（LangGraph / 工具 / Prompts）、`contracts/` + `data/`（契约与数据）。
- **契约目录**：`contracts/` 下 JSON Schema 为跨层「裁判员」，包括但不限于：`route.schema.json`、`spot.schema.json`、`chat-message.schema.json`、`checkin.schema.json`、`knowledge-chunk.schema.json`、`route-plan-request.schema.json`、`route-plan-response.schema.json`、`user-city-preference.schema.json`、`geofence-trigger.schema.json`、`home-carousel.schema.json`、`featured-route-catalog.schema.json`、`route-ingestion.schema.json`、`route-upload.schema.json`、`map-engine-setting.schema.json` 等。
- **坐标系**：数据库存 WGS-84；若前端使用高德等国内图商，须在 adapter 或渲染前完成 GCJ-02 等转换，避免坐标系混用。

---

## 3. 里程碑时间线（根据 Git 历史归纳）

> 说明：早期提交信息存在大量「优化」「bug」等泛化描述，下表**仅对可识别主题做归纳**；精确以 `git log` 为准。

| 时间段 | 主题归纳 | 备注 |
|--------|----------|------|
| 2026-03-27 | 首页、路线详情、Chat、结果/收藏/结束页等由 0.x 迭代至 1.0 | 纯前端原型阶段 |
| 2026-03-28 | 人格页、问问导游、导航与详情优化、配色与资源 | 仍为前端与内容迭代 |
| 2026-04-01 | 产品方案 / 技术方案 Markdown、`sprint1` 完成、`sprint2` 完成、`sprint3` 完成、`sprint4` 完成、`sprint7&8` 完成、大模型 API 调整 | 与 `WeGO_Development_Plan.md` 中 Sprint 编号对齐的提交出现 |
| 2026-04-02 | `plan完成`、搜索与数据清洗、**后台 1.0**、已打卡相关优化 | 管理端与数据侧能力增强 |
| 2026-04-03 | 上传数据、**内容上传 1.0**、上传链路优化、**发布 checklist 文档/脚本**、**sprint11 0.1**、新增路线等 | 与路线入库、Sprint 11（Agent 自助上传）方向一致 |
| 2026-04-04 | 城市选择 | 与城市偏好契约、首页选城联动 |
| 2026-04-05 | 地图配置进后台、多轮地图优化、Agent 优化、缺陷修复 | 地图与 Agent 体验迭代 |
| 2026-04-06 | 收获页 1.0、「去地图」、后端改造、缺陷修复 | 功能裁剪与后端演进 |
| 2026-04-07 | Cursor rules、记忆 runbook 相关、部署与部署服务器 0.1 | 工程化与部署 |
| 2026-04-08 | 移除 `wego.zip` 并纳入 `.gitignore` 等 | 仓库卫生与可推送性 |
| 2026-04-09 | 技术学习 HTML、**技术总览页发布**（`feat: publish tech overview page`） | 对外/对内技术说明页 |
| 2026-04-10 | 持续优化类提交 | 以 `git log` 为准 |

---

## 4. Sprint 计划与实现对照（简表）

`WeGO_Development_Plan.md` 第 3 节定义了 **Sprint 0–11** 的目标与验收任务。仓库内**真实完成度**请以以下为准：

- **代码与迁移**：`server/migrations/`、`src/lib/`、`agent/`、`data/scripts/`、`tests/`。
- **过程与发布**：`README.md`（SOP）、`docs/route-ingest-implementation.md`、`docs/route-upload-release-checklist.md`。

本日志**不逐条复制** Sprint 表格；若某 Sprint 全部验收完毕，可在下方「追加记录」中写一句并指向对应 PR/标签或日期范围。

---

## 5. 追加记录（最新在上）

<!-- 新条目请复制下一行模板并填写 -->

| 日期 | 摘要 | 详情与引用 |
|------|------|------------|
| 2026-04-10 | **同步 Antigravity 开发记录** | 汇总近期在 Antigravity 上协作的关键研发进程：<br>1. **技术架构基线文档更新** (2026-04-09)：对 `docs/tech-overview.html` 进行多轮深度审计与可视化对齐。排空废弃的 Supabase 架构计划，修正并确立由 Express.js 组件、PostgreSQL 数据库、JWT 鉴权组成的当前自建基础技术栈图景。<br>2. **开发工作流提速优化** (2026-04-01)：进行了包含本地调试流性能瓶颈排查、大模型消耗 Token 查询统计在内的生产力专项提升工程。 |
| 2026-04-10 | **初始化开发日志** | 确认此前无独立「开发过程」日志文件；新增本文档，汇总文档索引、架构基线、基于 Git 的里程碑归纳；后续里程碑请在本表追加。 |

---

## 6. 附录：如何用 Git 核对本日志

```bash
# 按日期查看提交
git log --format='%h %ad %s' --date=short -30

# 查看某文件的演进
git log --oneline -- path/to/file
```

若需要将某次发布与数据库迁移版本对齐，请同时记录：**迁移文件编号**（如 `server/migrations/0xx_*.sql`）与**部署环境**（本地 / Path2 / 生产）。
