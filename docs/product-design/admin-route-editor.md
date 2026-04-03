# 后台路线编辑与发布 — 产品设计（手工编辑）

> 与「路线上传 / Agent 解析」解耦；上传链路见 `route-upload-agent-product-design.md`。  
> 本文覆盖：**列表、新建、编辑、草稿自动保存、发布与版本、字段与计算规则**。

## 1. 一句话

旅行博主在后台**手工**维护路线与游玩点；编辑过程**实时保存草稿**，确认后**发布**并**递增版本号**；前台消费者读取已发布数据时遵守可见性 / 彩蛋规则。

## 2. 完成（前台）

「完成路线」为**用户在前台主动点击按钮**的行为，**不由系统根据规则自动判定**。  
热度等统计可先采用简单策略（例如按钮触发一次计数或后续再接专用事件表）；本阶段以**可扩展**为准，不强制复杂漏斗。

## 3. 列表

- **搜索**：先做**标题模糊搜索**（`ilike`），后续再扩展全文 / 多字段。
- **筛选**：保留分类（`category`）、标签（`tags`）；**已移除难度**。
- **行内信息**：标题、标签、分类、**路线是否可见**、**当前已发布版本号**（无发布则为 0）、热度展示；展开行内展示景点卡片与操作。

## 4. 草稿与发布

| 概念 | 说明 |
|------|------|
| 工作副本 | `routes` + `spots` 表中的当前行即为编辑中的**最新草稿**（admin 使用 service role 写入）。 |
| 实时保存 | 路线弹窗内字段变更后 **debounce 自动保存**（失败可提示）；用户也可理解为「随时落库」。 |
| 发布 | 用户点击「发布」：将当前路线 + 景点的契约形状快照写入 `route_versions`，`routes.published_version` 自增，`last_published_at` 更新。 |
| 版本号 | `published_version` 为单调递增整数；历史快照在 `route_versions.snapshot`（JSONB）。 |

上传解析用的 `route_drafts` 表与手工编辑**并行存在**，互不为替代关系。

## 5. 路线字段

| 字段 | 说明 |
|------|------|
| title / description / tags / category / cover_image | 人工维护 |
| is_visible | 路线是否对外可见（前台列表等） |
| thumbnail_image | 路线缩略图 URL 或 data URL；**基于参与路径的景点坐标生成近似路线形状图**，视觉风格与现有卡片图一致（圆角、主色描边）；点不足 2 个时可用 `cover_image` 兜底 |
| duration_minutes / total_distance_km | **由后台根据规则重算并写回**（见 §7），界面只读展示为主 |
| heat_level / heat_count | 只读；简单热度策略即可 |

**已废弃**：`difficulty`（库表与契约均已移除）。

## 6. 游玩点字段

| 字段 | 说明 |
|------|------|
| name、subtitle、short_desc、thumb、photos、tags | 人工维护 |
| rich_content | **图文主体**（各 `spot_type` 初期共用同一结构，由类型决定前台模板） |
| detail | 兼容旧数据；新编辑可与 `rich_content` 同步写入或仅写 `rich_content`（读取侧优先 `rich_content`） |
| lat / lng | **数据库始终存 WGS-84**（与项目坐标系约束一致） |
| 坐标系工具（仅 UI） | 用户选择输入坐标系：**WGS-84（GPS）** 或 **GCJ-02（高德等）**；若选 GCJ-02，保存前转换为 WGS-84 再入库（`src/lib/coordinate-frame.js`） |
| geofence_radius_m、estimated_stay_min、sort_order | 人工维护 |
| is_visible | 为 false 时：**不参与**建议路径、距离、时长计算 |
| is_easter_egg | 为 true 时：**默认不参与**前台列表、地图与路径/距离/时长计算（后续若有「发现彩蛋」流可单独接口） |
| spot_type | `attraction` \| `shop` \| `photo_spot` \| `knowledge` |

## 7. 建议路径与指标计算（编辑侧）

参与计算的景点集合：

`is_visible === true` **且** `is_easter_egg === false`  

按 `sort_order` 排序后：

- **建议游玩路线**：即上述点的有序序列（可为折线；路网导航属后续增强）。
- **总距离**：相邻参与点之间 Haversine 球面距离之和（千米）。
- **总时长**：参与点的 `estimated_stay_min` 之和 + 可选的简单路途时间估算（当前实现：每公里附加 5 分钟步行近似，可配置在 `route-metrics.js`）。

保存草稿或发布前，管理端可调用同一套函数更新 `routes.duration_minutes` 与 `routes.total_distance_km`。

## 8. 契约

- 主契约：`contracts/route.schema.json`、`contracts/spot.schema.json`
- 导入中间契约：`contracts/route-ingestion.schema.json`（与主契约对齐，不含 `difficulty`）
- 列表目录项：`contracts/featured-route-catalog.schema.json`（移除 `difficulty`）

## 9. 数据库

- `008_admin_route_editor.sql`：`routes` / `spots` 新列；`route_versions`；`DROP difficulty`。
- `009_route_versions_rls.sql`：收紧 `route_versions` 的 RLS（`anon` 不可读快照；`authenticated` 可 SELECT/INSERT；`service_role` 仍绕过，管理端不变）。
- 执行顺序：在 `001`–`008` 之后于 Supabase SQL Editor 执行 `009`。

## 9.1 契约字段 `category`

- `routes.category` 由 `005_routes_engagement.sql` 引入，现已写入 `contracts/route.schema.json` 与 `featured-route-catalog.schema.json`，与首页 Chip 筛选一致。

## 10. 实现文件索引

| 用途 | 路径 |
|------|------|
| 坐标转换 | `src/lib/coordinate-frame.js` |
| 距离/时长 | `src/lib/route-metrics.js` |
| 形状缩略图 | `src/lib/route-shape-thumbnail.js` |
| 管理 API | `src/lib/admin-api.js` |
| 前台读取过滤 | `src/lib/api-client.js` |
| 管理 UI | `src/admin-routes.html` |

## 11. 后续（非本阶段）

- 路线上传与手工编辑的合并策略、冲突解决  
- 缩略图改为对象存储 + Edge 生成高清图  
- 热度：独立事件表、衰减与防刷  
