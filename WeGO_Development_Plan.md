# WeGO · 原子化 AI 驱动开发计划

> 方法论核心：把 AI 当作"记忆力极短、单点执行力极强的高级外包"，用极度严谨的契约和原子化任务驱动开发。

---

## 0. 项目现状盘点

### 已完成（纯前端 UI 原型，全部 Mock 数据）

| 页面 | 文件 | 状态 | 说明 |
| :--- | :--- | :--- | :--- |
| 首页 | `index.html` + `app.js` + `style.css` | ✅ 完成 | 轮播、分类 Chip、路线卡片、底部导航、**城市选择（定位/手动/长时间未访问提示）** |
| 路线详情 | `route-detail.html/css/js` | ✅ 完成 | 地图预览(静态图)、景点列表、全屏地图 |
| AI 对话 | `ai-chat.html/css/js` | ✅ 完成 | 聊天气泡、知识卡片弹窗、语音/键盘输入 Mock |
| 导游人格 | `personality.html/css/js` | ✅ 完成 | 三种人格卡片轮播选择 |
| 旅程结束 | `trip-end.html/css/js` | ✅ 完成 | SVG 地图轨迹、收获卡片、成就统计 |
| 我的目的地 | `my-destinations.html/css/js` | ✅ 完成 | 目的地列表展示 |

### 核心问题

> **当前所有页面都是"画皮"**：数据全部硬编码在 JS/HTML 中，没有真实的地图 SDK、没有后端、没有 AI。
> 接下来的开发目标是**逐层注入真实能力**，同时保持 UI 层不被破坏。

---

## 1. 架构隔离：四层物理分离

按照"原子化 AI 驱动开发法"，将 WeGO 拆为 4 个**物理隔离**的模块，每个模块独立开发、独立测试：

```
WeGO/
├── src/                          # 前端源码（现有文件迁入）
│   ├── index.html
│   ├── ai-chat.html
│   ├── ...
│   ├── lib/                      # 前端公共库
│   │   ├── map-adapter.js        # 地图适配器（纯前端）
│   │   ├── api-client.js         # 后端通信层
│   │   ├── geo-utils.js          # 坐标转换 + 距离计算
│   │   └── event-bus.js          # 模块间事件通信
│   └── assets/
│
├── server/                       # 后端（Supabase Edge Functions）
│   ├── functions/
│   │   ├── chat/                 # AI 对话 API
│   │   ├── route-plan/           # 路线规划 API
│   │   ├── checkin/              # 打卡 API
│   │   └── knowledge/            # 知识库检索 API
│   └── migrations/               # 数据库迁移 SQL
│
├── agent/                        # AI Agent 逻辑（LangGraph）
│   ├── graph.py                  # Agent 主编排图
│   ├── tools/                    # Agent 工具集
│   │   ├── search_knowledge.py
│   │   ├── plan_route.py
│   │   ├── web_search.py
│   │   └── save_checkin.py
│   └── prompts/                  # Prompt 模板
│       ├── system.md             # 系统 Prompt
│       └── personalities/        # 人格 Prompt
│
├── data/                         # 知识库原始数据
│   ├── routes/                   # 路线元数据 JSON
│   ├── knowledge/                # 知识库文本（Markdown）
│   └── scripts/                  # 数据导入脚本
│
├── contracts/                    # 数据契约（JSON Schema）
│   ├── route.schema.json
│   ├── spot.schema.json
│   ├── chat-message.schema.json
│   ├── checkin.schema.json
│   └── knowledge-chunk.schema.json
│
└── tests/                        # 测试
    ├── contracts/                # 契约验证测试
    ├── unit/                     # 单元测试
    └── integration/              # 集成测试
```

**关键原则**：
- 前端是"傻瓜"，只负责渲染，不做业务判断
- AI 层独立运行，通过 API 暴露能力
- 契约文件是"裁判"，所有层的输入输出必须符合契约

---

## 2. 数据契约 (Data Contracts)

> 先定契约，再写逻辑。无论中间怎么实现，交付格式必须严格符合以下结构。

### Contract 1: 路线数据

```json
{
  "$id": "route",
  "type": "object",
  "required": ["id", "title", "spots"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "title": { "type": "string" },
    "description": { "type": "string" },
    "duration_minutes": { "type": "integer" },
    "tags": { "type": "array", "items": { "type": "string" } },
    "category": { "type": "string" },
    "cover_image": { "type": "string" },
    "thumbnail_image": { "type": "string" },
    "is_visible": { "type": "boolean" },
    "published_version": { "type": "integer" },
    "last_published_at": { "type": "string", "format": "date-time" },
    "total_distance_km": { "type": "number" },
    "spots": {
      "type": "array",
      "items": { "$ref": "#/$defs/spot" }
    }
  },
  "$defs": {
    "spot": {
      "type": "object",
      "required": ["id", "name", "lat", "lng", "sort_order"],
      "properties": {
        "id": { "type": "string", "format": "uuid" },
        "name": { "type": "string" },
        "subtitle": { "type": "string" },
        "short_desc": { "type": "string" },
        "detail": { "type": "string" },
        "rich_content": { "type": "string" },
        "tags": { "type": "array", "items": { "type": "string" } },
        "thumb": { "type": "string" },
        "photos": { "type": "array", "items": { "type": "string" } },
        "lat": { "type": "number" },
        "lng": { "type": "number" },
        "geofence_radius_m": { "type": "integer", "default": 30 },
        "estimated_stay_min": { "type": "integer" },
        "sort_order": { "type": "integer" },
        "is_visible": { "type": "boolean" },
        "is_easter_egg": { "type": "boolean" },
        "spot_type": { "type": "string", "enum": ["attraction", "shop", "photo_spot", "knowledge"] }
      }
    }
  }
}
```

> **权威契约**：以仓库内 `contracts/route.schema.json`、`contracts/spot.schema.json` 为准；上表为开发计划摘要。数据库迁移见 `008_admin_route_editor.sql`、`009_route_versions_rls.sql`；后台产品说明见 `docs/product-design/admin-route-editor.md`。

### Contract 2: 聊天消息

```json
{
  "$id": "chat-message",
  "type": "object",
  "required": ["id", "role", "content", "created_at"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "role": { "enum": ["user", "ai", "system"] },
    "content": { "type": "string" },
    "trigger_type": { "enum": ["user_input", "geofence", "proactive"] },
    "inserts": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type"],
        "properties": {
          "type": { "enum": ["knowledge", "shop", "distance", "image", "attraction"] },
          "title": { "type": "string" },
          "summary": { "type": "string" },
          "detail_id": { "type": "string" },
          "cta": { "type": "string" }
        }
      }
    },
    "created_at": { "type": "string", "format": "date-time" }
  }
}
```

### Contract 3: AI 路线规划请求/响应

```json
{
  "$id": "route-plan-request",
  "type": "object",
  "required": ["user_query"],
  "properties": {
    "user_query": { "type": "string" },
    "current_location": {
      "type": "object",
      "properties": {
        "lat": { "type": "number" },
        "lng": { "type": "number" }
      }
    },
    "constraints": {
      "type": "object",
      "properties": {
        "max_hours": { "type": "number" },
        "max_walk_km": { "type": "number" },
        "themes": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

```json
{
  "$id": "route-plan-response",
  "type": "object",
  "required": ["route_name", "total_distance_km", "total_duration_min", "waypoints"],
  "properties": {
    "route_name": { "type": "string" },
    "total_distance_km": { "type": "number" },
    "total_duration_min": { "type": "integer" },
    "total_walk_min": { "type": "integer" },
    "waypoints": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "lat", "lng"],
        "properties": {
          "name": { "type": "string" },
          "lat": { "type": "number" },
          "lng": { "type": "number" },
          "estimated_stay_min": { "type": "integer" },
          "description": { "type": "string" }
        }
      }
    },
    "polyline": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "lat": { "type": "number" },
          "lng": { "type": "number" }
        }
      }
    },
    "narration": { "type": "string" }
  }
}
```

### Contract 4: 打卡记录

```json
{
  "$id": "checkin",
  "type": "object",
  "required": ["spot_id", "lat", "lng"],
  "properties": {
    "spot_id": { "type": "string", "format": "uuid" },
    "lat": { "type": "number" },
    "lng": { "type": "number" },
    "photos": { "type": "array", "items": { "type": "string" } },
    "ai_summary": { "type": "string" }
  }
}
```

### Contract 5: 用户城市偏好（本地持久化）

> 权威契约：`contracts/user-city-preference.schema.json`。用于 `localStorage` 与后续服务端同步时的字段对齐。

核心字段：`selected_city_adcode`（国标 adcode）、`last_visit_at`（上次会话时间戳，用于「长时间未访问」判定）、可选 `mismatch_snooze`（用户选择「保持当前城市」后的冷却）。

### Contract 6: 地理围栏触发信号

```json
{
  "$id": "geofence-trigger",
  "type": "object",
  "required": ["event", "spot_id", "coordinates"],
  "properties": {
    "event": { "enum": ["arrived_at", "left_from"] },
    "spot_id": { "type": "string", "format": "uuid" },
    "coordinates": {
      "type": "object",
      "required": ["lat", "lng"],
      "properties": {
        "lat": { "type": "number" },
        "lng": { "type": "number" }
      }
    },
    "user_status": { "enum": ["walking", "standing", "unknown"] }
  }
}
```

---

## 3. 开发 Sprint 与原子化任务拆解

> 每个 Task 遵循"单一文件、单一函数、单一目的"原则。
> 每次只让 AI 关注 50-100 行代码的修改。

---

### Sprint 0：项目基建（预计 2 天）

> 目标：建立目录结构、契约文件、基础工具，为后续所有开发搭好脚手架。

| # | Task | 类型 | 涉及文件 | 验收标准 |
|---|------|------|---------|---------|
| 0.1 | 创建项目目录结构：`src/lib/`, `server/`, `agent/`, `data/`, `contracts/`, `tests/` | 基建 | 目录创建 | `ls` 验证目录树正确 |
| 0.2 | 将现有前端文件迁移到 `src/` 目录下，确保页面仍可正常打开 | 基建 | 现有所有 HTML/CSS/JS | 浏览器打开 `src/index.html` 功能不变 |
| 0.3 | 将上述 5 个 JSON Schema 写入 `contracts/` 目录 | 契约 | 5 个 `.schema.json` 文件 | JSON 有效，结构完整 |
| 0.4 | 编写 `src/lib/event-bus.js`：一个 50 行以内的发布/订阅事件总线 | 纯逻辑 | `event-bus.js` | `on/emit/off` 方法可用 |
| 0.5 | 编写 `src/lib/geo-utils.js`：包含 `haversineDistance(lat1,lng1,lat2,lng2)` 函数，返回米 | 纯逻辑 | `geo-utils.js` | 已知坐标对计算结果误差 < 1% |
| 0.6 | 初始化 `data/routes/dashilan.json`：将现有 `route-detail.js` 中的 `SPOT_DATA` 硬编码数据提取为符合 Contract 1 的 JSON | 数据 | `dashilan.json` | JSON 通过 Schema 校验 |

---

### Sprint 1：地图适配器层 —— 先画骨架（预计 5 天）

> 目标：实现 Map Adapter 抽象层，先接入高德，让静态图变成真实交互地图。
> 原则：一次只接一个引擎，绝不同时碰两个。

| # | Task | 类型 | 涉及文件 | 验收标准 |
|---|------|------|---------|---------|
| **1.1** | 编写 `src/lib/map-adapter.js`：定义 `WeGOMap` 抽象类，只写接口签名（`setCenter/addMarker/drawRoute/addGeofence`），所有方法 `throw 'Not implemented'` | 纯接口 | `map-adapter.js` | 类可被 `new`，调用任何方法抛出预期错误 |
| **1.2** | 编写 `src/lib/adapters/amap-adapter.js`：实现 `AMapAdapter`，只实现 `init()` 方法（加载高德 JS API，初始化地图容器），其它方法暂抛异常 | 纯SDK初始化 | `amap-adapter.js` | 页面显示高德底图，中心点为大栅栏 |
| **1.3** | 在 `AMapAdapter` 中实现 `setCenter(lng, lat, zoom)` 和 `fitBounds(bounds)` | 单一功能 | `amap-adapter.js` | 调用后地图视角正确移动 |
| **1.4** | 在 `AMapAdapter` 中实现 `addMarker(lng, lat, opts)`：opts 包含 `icon/label/onClick` | 单一功能 | `amap-adapter.js` | 大栅栏路线 5 个景点标记正确显示 |
| **1.5** | 在 `AMapAdapter` 中实现 `drawRoute(coords, style)`：调用高德步行路线规划 API，将返回的 polyline 绘制到地图上 | 单一功能 | `amap-adapter.js` | 5 个景点间的步行路线正确绘制 |
| **1.6** | 在 `AMapAdapter` 中实现 `addGeofence(lng, lat, radius, onEnter)`：结合 `geo-utils.js` 的 `haversineDistance` 和浏览器 `watchPosition` 实现围栏判定 | 单一功能 | `amap-adapter.js` + `geo-utils.js` | Console 中能看到围栏触发日志 |
| **1.7** | 修改 `route-detail.html`：将静态地图图片替换为高德地图容器，从 `data/routes/dashilan.json` 读取数据渲染 | 纯联调 | `route-detail.html/js` | 路线详情页显示真实高德地图 + 标记 + 路线 |
| **1.8** | 编写 `src/lib/adapters/mapbox-adapter.js`：实现 `MapboxAdapter`，复刻 1.2-1.6 的全部接口（用 Mapbox GL JS） | 独立引擎 | `mapbox-adapter.js` | Mapbox 底图 + 标记 + 路线正确显示 |
| **1.9** | 编写 `src/lib/adapters/bmap-adapter.js`：实现 `BMapAdapter`，复刻 1.2-1.6 的全部接口（用百度 JS API） | 独立引擎 | `bmap-adapter.js` | 百度底图 + 标记 + 路线正确显示 |
| **1.10** | 在 `map-adapter.js` 中实现 `MapAdapterFactory.create(provider)` 工厂，加入 `switchProvider()` 运行时切换逻辑 | 纯逻辑 | `map-adapter.js` | 切换引擎后地图正确重新渲染 |
| **1.11** | 在路线详情页添加"地图引擎切换"设置入口（三个 icon/tab），调用 `switchProvider` | 纯 UI | `route-detail.html/js` | 点击切换后地图引擎切换生效 |

---

### Sprint 2：后端基建 —— Supabase 搭建（预计 3 天）

> 目标：搭建 Supabase 项目，创建数据库表，实现基础 CRUD API。
> 原则：Pure SQL，一次一张表，每张表独立验证。

| # | Task | 类型 | 涉及文件 | 验收标准 |
|---|------|------|---------|---------|
| **2.1** | 创建 Supabase 项目（通过 Dashboard 或 CLI），记录 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 到 `.env` | 环境搭建 | `.env` | Supabase Dashboard 可访问 |
| **2.2** | 编写 `server/migrations/001_routes.sql`：创建 `routes` 表（含全部字段），执行迁移 | 纯 SQL | `001_routes.sql` | `SELECT * FROM routes` 返回空表 |
| **2.3** | 编写 `server/migrations/002_spots.sql`：创建 `spots` 表（含 PostGIS `geom` 字段 + `geofence_radius_m` + `estimated_stay_min`），执行迁移 | 纯 SQL | `002_spots.sql` | `SELECT * FROM spots` 返回空表 |
| **2.4** | 编写 `server/migrations/003_knowledge.sql`：创建 `knowledge_embeddings` 表（含 `VECTOR(1536)` + `TSVECTOR` + PostGIS `geom`），创建 HNSW、GIN、GIST 索引 | 纯 SQL | `003_knowledge.sql` | 三个索引均成功创建 |
| **2.5** | 编写 `server/migrations/004_user_data.sql`：创建 `user_checkins` 和 `agent_transcripts` 表 | 纯 SQL | `004_user_data.sql` | 两张表创建成功 |
| **2.6** | 编写 `data/scripts/seed-dashilan.js`：读取 `data/routes/dashilan.json`，通过 Supabase JS SDK 插入 `routes` 和 `spots` 表 | 数据导入 | `seed-dashilan.js` | `SELECT COUNT(*) FROM spots` = 5 |
| **2.7** | 编写 `src/lib/api-client.js`：封装 Supabase JS SDK，暴露 `getRoute(id)`, `getSpots(routeId)`, `saveCheckin(data)` 三个方法 | 纯接口 | `api-client.js` | 调用 `getRoute()` 返回符合 Contract 1 的 JSON |
| **2.8** | 修改 `route-detail.js`：用 `api-client.getRoute()` 替换现有硬编码 `SPOT_DATA`，从数据库读取景点数据渲染列表 | 纯联调 | `route-detail.js` | 页面从 Supabase 读取真实数据渲染 |

---

### Sprint 3：知识库构建 —— RAG 数据准备（预计 4 天）

> 目标：将现有硬编码的知识库内容迁入 Supabase pgvector，实现基础语义检索。
> 原则：数据处理和检索逻辑严格分开。

| # | Task | 类型 | 涉及文件 | 验收标准 |
|---|------|------|---------|---------|
| **3.1** | 将 `ai-chat.js` 中的 `KNOWLEDGE_DETAILS` 提取为 `data/knowledge/dashilan/` 目录下的 Markdown 文件，每个知识点一个文件 | 数据提取 | 3 个 `.md` 文件 | Markdown 内容完整且可读 |
| **3.2** | 编写 `data/scripts/chunk-knowledge.js`：读取 Markdown 文件，按 `##` 标题切片，每 chunk 300-500 token，输出 JSON 数组（含 `chunk_text, chunk_type, spot_id, metadata`） | 纯逻辑 | `chunk-knowledge.js` | 输出 JSON 符合 Contract 5, chunk 数量 >= 9 |
| **3.3** | 编写 `data/scripts/embed-chunks.js`：读取切片 JSON，调用 OpenAI Embedding API（text-embedding-3-small），将结果写入带 `embedding` 字段的 JSON | 纯 API 调用 | `embed-chunks.js` | 每个 chunk 附带 1536 维向量 |
| **3.4** | 编写 `data/scripts/seed-knowledge.js`：将带向量的切片 JSON 批量插入 `knowledge_embeddings` 表 | 数据导入 | `seed-knowledge.js` | `SELECT COUNT(*) FROM knowledge_embeddings` >= 9 |
| **3.5** | 编写 `server/functions/knowledge/search.js`：Supabase Edge Function，接收 `{ query, lat, lng, radius_m }` 参数，执行三重混合检索 SQL（向量 + 空间 + 全文），返回 Top-5 结果 | 后端 API | `search.js` | 输入"兔儿爷历史"返回相关 chunks，Top-1 相似度 > 0.7 |
| **3.6** | 编写 `tests/integration/knowledge-search.test.js`：验证检索接口输入/输出符合契约，测试 3 个场景（语义匹配/空间过滤/关键词命中） | 测试 | `knowledge-search.test.js` | 3 个测试全部 PASS |

---

### Sprint 4：AI Agent —— 对话引擎（预计 5 天）

> 目标：用 LangGraph 构建 Agent，替换现有 Mock 对话，实现真实 AI 讲解。
> 原则：先让 Agent 单独跑通（CLI 测试），再接入前端。

| # | Task | 类型 | 涉及文件 | 验收标准 |
|---|------|------|---------|---------|
| **4.1** | 初始化 `agent/` Python 项目：`pyproject.toml` + `requirements.txt`（langchain, langgraph, supabase, openai） | 基建 | 配置文件 | `pip install` 成功 |
| **4.2** | 编写 `agent/prompts/system.md`：系统 Prompt，定义 Agent 角色（WeGO AI 导游）、输出格式（必须符合 chat-message Contract）、可用工具列表 | 纯 Prompt | `system.md` | Prompt 引用了 chat-message 契约结构 |
| **4.3** | 编写 `agent/prompts/personalities/local.md`：老北京玩家人格 Prompt | 纯 Prompt | `local.md` | 语气、用词符合人格设定 |
| **4.4** | 编写 `agent/tools/search_knowledge.py`：调用 Sprint 3 的知识检索 API，返回检索结果 | 单一工具 | `search_knowledge.py` | CLI 调用返回正确结果 |
| **4.5** | 编写 `agent/tools/web_search.py`：调用 Tavily/Exa API 搜索即时信息 | 单一工具 | `web_search.py` | CLI 调用返回搜索结果 |
| **4.6** | 编写 `agent/tools/plan_route.py`：调用高德路线规划 API，接收 POI 列表，返回符合 route-plan-response 契约的 JSON | 单一工具 | `plan_route.py` | 输出 JSON 通过 Schema 校验 |
| **4.7** | 编写 `agent/graph.py`：LangGraph 状态图，串联 LLM + 3 个 Tools，实现意图分类 → 工具调用 → 响应生成的完整流程 | 编排逻辑 | `graph.py` | CLI 输入"兔儿爷为什么骑老虎"返回知识型回答 |
| **4.8** | 编写 `server/functions/chat/index.js`：Supabase Edge Function，接收用户消息 + 位置，调用 Agent，通过 SSE 流式返回 AI 消息 | 后端 API | `chat/index.js` | curl 请求返回 SSE 流 |
| **4.9** | 编写 `src/lib/chat-client.js`：前端 SSE 客户端，连接 chat API，解析流式消息，触发 EventBus 事件 | 纯前端 | `chat-client.js` | EventBus 收到消息事件 |
| **4.10** | 修改 `ai-chat.js`：移除 `MOCK_MESSAGES` 和 `KNOWLEDGE_DETAILS` 硬编码，改用 `chat-client.js` 接收真实 AI 消息并渲染 | 纯联调 | `ai-chat.js` | 聊天页面显示真实 AI 回复 |
| **4.11** | 修改 `ai-chat.js`：键盘输入改为真实发送到 chat API，语音输入暂用文字替代 | 纯联调 | `ai-chat.js` | 输入文字后收到 AI 真实回复 |

---

### Sprint 5：地理围栏 + 主动触发（预计 3 天）

> 目标：实现"走到景点附近 → Agent 主动讲解"的体验闭环。

| # | Task | 类型 | 涉及文件 | 验收标准 |
|---|------|------|---------|---------|
| **5.1** | 编写 `src/lib/geofence-manager.js`：管理当前路线所有景点的围栏状态，封装 `watchPosition` + `haversineDistance`，进入围栏时发出 `EventBus.emit('geofence:enter', spotData)` | 纯逻辑 | `geofence-manager.js` | 模拟坐标变化时 Console 输出围栏事件 |
| **5.2** | 在 `ai-chat.js` 中监听 `geofence:enter` 事件，自动向 chat API 发送 `{ trigger_type: 'geofence', spot_id }` 请求，触发 Agent 主动讲解 | 纯联调 | `ai-chat.js` | 围栏触发时聊天界面自动出现 AI 消息 |
| **5.3** | 编写 `agent/tools/geofence_narration.py`：Agent 收到围栏触发信号后，自动调用 `search_knowledge(spot_id)` 并生成开场白 | 单一工具 | `geofence_narration.py` | Agent 输出"嘿，你注意到..."风格的开场 |
| **5.4** | 添加 GPS 模拟调试工具：在开发模式下，页面底部添加一个坐标模拟器，可手动输入经纬度触发围栏（方便室内测试） | 调试工具 | `src/lib/debug-gps.js` | 输入坐标后围栏正确触发 |

---

### Sprint 6：打卡系统（预计 2 天）

> 目标：实现用户打卡 → 地图标记 → 数据持久化。

| # | Task | 类型 | 涉及文件 | 验收标准 |
|---|------|------|---------|---------|
| **6.1** | 在 `api-client.js` 中实现 `saveCheckin(data)` 方法：发送符合 Contract 4 的打卡数据到 Supabase | 纯接口 | `api-client.js` | 调用后 `user_checkins` 表新增记录 |
| **6.2** | 在 `api-client.js` 中实现 `getCheckins(userId)` 方法：查询用户打卡历史 | 纯接口 | `api-client.js` | 返回打卡记录数组 |
| **6.3** | 在 `map-adapter.js` 中实现 `addCheckinMarker(lng, lat, opts)` 方法：使用发光勋章样式的自定义 Marker | 纯 UI | 三个 adapter 文件 | 打卡标记显示为特殊样式 |
| **6.4** | 在路线详情页的打卡按钮上绑定真实逻辑：获取 GPS → `saveCheckin()` → `addCheckinMarker()` → 刷新 UI | 纯联调 | `route-detail.js` | 点击打卡后地图上出现标记，刷新后标记仍在 |

---

### Sprint 7：Agent 路线规划（预计 3 天）

> 目标：实现用户自然语言描述需求 → Agent 自主规划路线 → 地图渲染。

| # | Task | 类型 | 涉及文件 | 验收标准 |
|---|------|------|---------|---------|
| **7.1** | 完善 `agent/tools/plan_route.py`：增加约束校验（max_hours、max_walk_km），超出约束时自动裁减景点重新规划 | 纯逻辑 | `plan_route.py` | "半天不累"约束下路线总距离 < 3km |
| **7.2** | 在 `agent/graph.py` 中增加路线规划分支：当用户意图为"规划路线"时，调用 `search_knowledge` → `plan_route` → 生成口语化建议 | 编排逻辑 | `graph.py` | "想逛非遗"返回有效路线 JSON |
| **7.3** | 编写 `server/functions/route-plan/index.js`：封装路线规划 API，返回符合 `route-plan-response` 契约的 JSON | 后端 API | `route-plan/index.js` | 输出 JSON 通过 Schema 校验 |
| **7.4** | 在 `ai-chat.js` 中增加路线规划消息的渲染：识别 AI 返回的带 `polyline` 的消息，调用 `map-adapter.drawRoute()` 在地图上渲染 | 纯联调 | `ai-chat.js` | AI 回复路线后地图上自动画出路径 |

---

### Sprint 8：数据驱动首页（预计 2 天）

> 目标：首页从数据库读取路线列表，替换硬编码 HTML。

| # | Task | 类型 | 涉及文件 | 验收标准 |
|---|------|------|---------|---------|
| **8.1** | 在 `api-client.js` 中实现 `getRoutes(filters)` 方法：查询路线列表，支持按 tag 等过滤；**已移除 difficulty**；仅返回 `is_visible !== false` 的路线 | 纯接口 | `api-client.js` | 返回路线列表数组 |
| **8.2** | 修改 `index.html` + `app.js`：路线卡片区域改为 JS 动态渲染，数据来自 `getRoutes()` | 纯联调 | `index.html`, `app.js` | 首页显示数据库中的路线 |
| **8.3** | 修改分类 Chip 点击逻辑：点击分类标签时调用 `getRoutes({ tag })` 重新加载 | 纯联调 | `app.js` | 点击"非遗"只显示非遗路线 |
| **8.4** | 首页城市：`contracts/user-city-preference.schema.json`；`admin-route-cities.js` 增加 `resolveCityFromWgs84`；`city-preference.js` 持久化与 7 天未访问弹窗；`city-select.html` 手动选城；`index.html` 顶部入口与底部 sheet | 联调 | 上述文件 + `style.css` | 首访按定位或默认北京；超时回访且定位城市≠已选时弹出确认；手动选城可写回 |

---

### Sprint 9：生产数据清洗与入库流水线（预计 4 天）

> 目标：建立“Markdown 非结构化内容 -> 结构化校验 -> 清洗 -> 审核 -> 入库”的可复用生产流程。  
> 原则：先契约后入库；任一步失败即中断；全链路可审计。

| # | Task | 类型 | 涉及文件 | 验收标准 |
|---|------|------|---------|---------|
| **9.1** | 新增 `contracts/route-ingestion.schema.json`，定义候选 JSON 入库前契约（含 route + spots） | 契约 | `contracts/route-ingestion.schema.json` | Schema 可用于 AJV 校验且覆盖必填字段 |
| **9.2** | 编写 `data/scripts/parse-route-md.js`：读取 Markdown，抽取为结构化 JSON（候选） | 解析 | `parse-route-md.js` | 可从示例 md 产出 `route-candidate.json` |
| **9.3** | 编写 `data/scripts/validate-route-json.js`：对候选 JSON 执行 Schema 校验并输出错误报告 | 校验 | `validate-route-json.js` | 非法输入可输出字段级错误；合法输入 PASS |
| **9.4** | 编写 `data/scripts/clean-route-json.js`：执行类型修正、标签标准化、坐标范围检查、排序修复 | 清洗 | `clean-route-json.js` | 清洗后 JSON 满足契约且规则报告完整 |
| **9.5** | 扩展 `data/scripts/seed-beijing-catalog.js` 或新增 `seed-route-candidate.js`，支持单条候选路线幂等 upsert | 入库 | `seed-route-candidate.js` | 重复执行不产生重复行，routes/spots 正确更新 |
| **9.6** | 新增 `server/migrations/006_route_ingestion_jobs.sql`，记录 ingestion 审计状态与报错 | 数据库 | `006_route_ingestion_jobs.sql` | SQL 执行成功，审计表可写入记录 |
| **9.7** | 编写 `tests/contracts/route-ingestion.test.mjs`，覆盖“解析后 -> 校验 -> 清洗后”三段契约测试 | 测试 | `tests/contracts/route-ingestion.test.mjs` | 全部测试 PASS |
| **9.8** | 在 README 或运维文档增加发布 SOP（dry run -> review -> publish -> verify -> rollback） | 文档 | `README` 或运维文档 | 团队可按步骤独立完成一次新路线上线 |



### Sprint 10：路线内容管理后台（预计 3 天）

> 目标：为内容运营提供独立管理界面，支持列表筛选、**新增路线**、编辑路线与游玩点、**草稿自动保存**、**发布与版本快照**（`route_versions`）、删除；热度字段 read-only。
> 原则：契约见 `contracts/route.schema.json` 等；**service_role** 直连；前台 `api-client.js` 仅用 anon，并按可见性/彩蛋过滤。
> 数据库：`008_admin_route_editor.sql`、`009_route_versions_rls.sql`；产品细则见 `docs/product-design/admin-route-editor.md`。

| # | Task | 类型 | 涉及文件 | 验收标准 |
|---|------|------|---------|---------|
| **10.1** | 更新 `WeGO_Product_Proposal.md`、`WeGO_Technical_Solution.md`、`WeGO_Development_Plan.md`：在 Sprint 9 成果基础上补充 Admin 模块的产品定位、技术架构与开发计划 | 文档 | 三份文档 | 三份文档均已更新，内容完整可读 |
| **10.2** | 扩展 `src/lib/admin-api.js`：CRUD + `insertRoute` / `insertSpot` / `recomputeRouteDerived` / `publishRoute` / `getRouteVersions`；屏蔽 heat 与非法修改 published_version | 纯接口 | `src/lib/admin-api.js` | 方法可调用，发布写入 `route_versions` |
| **10.3** | 新建 `src/style-admin.css`：复用 WeGO 主色体系（故宫红、象牙白、Manrope/Noto Serif SC），覆盖表格、模态框、展开行、分页、标签 Chip、heat 字段只读样式 | 样式 | `src/style-admin.css` | 样式与 WeGO 主风格一致，heat 字段无编辑控件 |
| **10.4** | 新建 `admin-routes.html`：路线管理主页面，含顶部工具栏（搜索/过滤）、路线列表表格（带展开行查看景点）、分页控件 | 页面 | `admin-routes.html` | 页面可正常打开，列表加载正常，展开行显示景点 |
| **10.5** | 在 `admin-routes.html` 中实现编辑/删除模态框：路线（含发布/草稿状态、可见性）、游玩点（rich_content、spot_type、坐标参照、彩蛋）、删除确认 | 交互 | `admin-routes.html`（内联 JS） | 保存/发布/删除流程可用 |
| **10.6** | 验收测试：页面加载、CRUD、发布版本、heat 只读、跨域与迁移 008/009 已执行 | 测试 | 全部文件 | 验收通过，无关键 JS 报错 |

---

---

### Sprint 11：Agent 自助路线上传（预计 5 天）

> 目标：让运营人员或普通用户通过对话或上传页面，自助提交路线内容文件（JSON / Markdown / TXT / URL），Agent 自动解析、校验、补全缺失内容（经纬度自动查询、主观内容对话询问），经用户二次确认后写入数据库。
> 原则：Agent 全程驱动，用户始终掌握最终确认权；每次写入必须经过 pending_review 状态。

#### 11.1 新增数据契约

| # | Task | 类型 | 涉及文件 | 验收标准 |
|---|------|------|---------|---------|
| **11.1.1** | 新增 `contracts/route-upload.schema.json`：定义路线上传请求契约，含 `session_id` / `file_content` / `file_type` / `source_url` 字段 | 契约 | `contracts/route-upload.schema.json` | Schema 可用于 AJV 校验 |
| **11.1.2** | 扩展 `contracts/route-ingestion.schema.json`：在 `gap_items[]` 中增加 `gap_type`（objective/subjective）、`auto_queried`、suggested_value 字段 | 契约变更 | `contracts/route-ingestion.schema.json` | 扩展字段不影响现有校验逻辑 |

#### 11.2 数据库 Migration

| # | Task | 类型 | 涉及文件 | 验收标准 |
|---|------|------|---------|---------|
| **11.2.1** | 编写 `server/migrations/007_route_drafts.sql`：创建 `route_drafts` 表（session_id / source_file / file_type / raw_content / parsed_data / status / gap_items / user_overrides） | 纯 SQL | `007_route_drafts.sql` | SQL 执行成功，表结构符合设计 |

#### 11.3 Agent 工具开发

| # | Task | 类型 | 涉及文件 | 验收标准 |
|---|------|------|---------|---------|
| **11.3.1** | 编写 `agent/tools/upload_route.py`：`UploadRouteInput`（含 file_content / file_type / session_id），内部实现 JSON / Markdown / TXT / URL 四种格式解析，返回 `UploadRouteOutput`（含 status / route_preview / gaps[]） | 单一工具 | `upload_route.py` | CLI 传入示例 JSON 文件返回正确解析结果 |
| **11.3.2** | 编写 `agent/tools/auto_query.py`：实现 `auto_query_coordinates(spot_name)` 调用高德 Geocoding API 查询经纬度；`infer_tags_from_spot(spot)` 推断标签；`infer_stay_duration(spot)` 推断停留时长；`fetch_url_content(url)` 抓取网页正文 | 辅助函数 | `auto_query.py` | 已知景点名称返回正确 WGS-84 坐标（7位小数） |
| **11.3.3** | 编写 `agent/tools/confirm_route_upload.py`：`ConfirmRouteUploadInput`（session_id / confirmed / overrides），执行 routes + spots 表 upsert，写入 ingestion_job，返回写入结果 | 单一工具 | `confirm_route_upload.py` | CLI 确认后数据库出现对应 routes + spots 记录 |
| **11.3.4** | 新增 `agent/prompts/upload_route.md`：upload_route 工具的系统指令，包含 Gap 分类处理逻辑（客观 Gap 自动查询/主观 Gap 询问用户）、输出格式要求 | Prompt | `upload_route.md` | Prompt 中明确包含"高德 API 查询后展示给用户确认"的指令 |

#### 11.4 Agent 核心变更

| # | Task | 类型 | 涉及文件 | 验收标准 |
|---|------|------|---------|---------|
| **11.4.1** | 修改 `agent/graph.py`：将 `upload_route` / `confirm_route_upload` / `auto_query` 三个工具注册到 LangGraph Agent 工具列表 | 编排逻辑 | `graph.py` | graph 加载后 tools 列表包含全部新工具 |
| **11.4.2** | 修改 `agent/server.py`：扩展 `/chat` 端点支持 `file_content` + `file_type` 上传模式；新增 `POST /route-upload/confirm` 端点；新增 `GET /route-upload/:session_id` 查询会话状态 | 后端 API | `server.py` | curl 测试三个端点均返回正确响应 |

#### 11.5 Supabase Edge Function

| # | Task | 类型 | 涉及文件 | 验收标准 |
|---|------|------|---------|---------|
| **11.5.1** | 编写 `server/functions/route-ingest/index.js`：`POST /functions/v1/route-ingest` 接收上传请求，调用 Python Agent 工具，返回解析状态和 Gap 列表；`GET /functions/v1/route-ingest/:session_id` 查询会话状态；`POST /functions/v1/route-ingest/:session_id/confirm` 执行确认写入 | 后端 API | `route-ingest/index.js` | 输出 JSON 通过 route-ingestion.schema.json 校验 |

#### 11.6 前端组件开发

| # | Task | 类型 | 涉及文件 | 验收标准 |
|---|------|------|---------|---------|
| **11.6.1** | 新建 `src/components/RouteUploader.tsx`：文件上传组件，支持拖拽上传（JSON/MD/TXT）、点击选择文件、URL 输入、纯文本粘贴四种模式 | UI 组件 | `RouteUploader.tsx` | 四种模式均能正确触发上传流程 |
| **11.6.2** | 新建 `src/components/GapFillingChat.tsx`：Gap 补全对话组件，渲染 Agent 的主观 Gap 询问消息 + 用户回复输入区，处理用户补充内容并提交给 Agent | UI 组件 | `GapFillingChat.tsx` | 主观 Gap 询问后用户回复被正确提交 |
| **11.6.3** | 新建 `src/components/RoutePreview.tsx`：二次确认预览组件，展示完整路线预览（含所有景点字段状态），渲染「确认上传」/「继续编辑」/「取消」三个操作按钮 | UI 组件 | `RoutePreview.tsx` | 预览数据与 Agent 返回的 route_preview 一致 |
| **11.6.4** | 新建 `src/pages/upload-route/index.tsx`：独立上传页面，整合 RouteUploader / GapFillingChat / RoutePreview 三个组件，串联完整上传 → Gap 处理 → 确认流程 | 页面 | `upload-route/index.tsx` | 页面可正常打开，四种文件格式均可完成完整流程 |
| **11.6.5** | 修改 `src/components/ChatPanel.tsx`：在聊天输入区增加「上传路线」触发入口（文件上传按钮），点击后触发上传流程 | UI 改动 | `ChatPanel.tsx` | 聊天界面出现上传按钮，点击后可上传文件 |
| **11.6.6** | 修改 `src/App.tsx`：路由增加 `/upload-route` 页面注册 | 路由 | `App.tsx` | 访问 `/upload-route` 正确渲染上传页面 |

---

## 4. 每个 Task 的执行规范


### 给 AI 的 Prompt 模板

每次向 AI 布置任务时，使用以下固定模板：

```markdown
## 任务

[一句话描述]

## 约束

- 只修改文件：[文件路径]
- 不得修改其它任何文件
- 代码风格与项目保持一致

## 输入

[明确的输入数据/接口]

## 输出

必须严格符合以下 JSON 结构（不得多字段或少字段）：
[粘贴对应的 Contract]

## 验收

- [ ] [具体的验证步骤]
```

### 执行检查清单

每个 Task 完成后，按以下流程验收：

1. **编译检查**：无语法错误
2. **契约校验**：输入/输出符合 JSON Schema
3. **功能验证**：按验收标准手动测试
4. **回归测试**：确认未破坏已有功能
5. **代码审查**：确认修改范围仅限指定文件

---

## 5. 风险与注意事项

| 风险 | 缓解措施 |
| :--- | :--- |
| AI 修改超出指定文件范围 | 每次 Task 明确列出"只修改文件"，完成后 `git diff` 验证 |
| 坐标系混淆导致地图错位 | `geo-utils.js` 中所有转换函数加单测，Sprint 1 结束后专项验证 |
| Supabase Edge Function 冷启动慢 | MVP 阶段可接受 1-2s 延迟，后期评估 Worker 部署 |
| LLM 空间幻觉导致路线不合理 | 三步分离原则：AI 只生成节点，LBS API 校验距离/耗时 |
| 知识库数据不足导致 RAG 效果差 | Sprint 3 先用手工整理的高质量数据验证，不追求量 |
| 本地 Intel MacBook 内存限制 | 每次 Task 控制在 50-100 行修改，避免大上下文 |

---

## 6. 里程碑总览

```
Sprint 0 ──▸ Sprint 1 ──▸ Sprint 2 ──▸ Sprint 3
基建          地图引擎       后端搭建       知识库
(2天)         (5天)          (3天)          (4天)
              ↓
Sprint 4 ──▸ Sprint 5 ──▸ Sprint 6 ──▸ Sprint 7 ──▸ Sprint 8
AI Agent       围栏触发       打卡系统       路线规划       数据驱动首页
(5天)          (3天)          (2天)          (3天)          (2天)
                                                          ↓
                                               Sprint 9 ──▸ Sprint 10 ──▸ Sprint 11
                                               数据清洗       管理后台      Agent 自助上传
                                               (4天)          (3天)         (5天)
```

**总计约 34 个工作日**，每个 Sprint 结束时可独立演示一个完整的功能闭环。

---

*"把大象装进冰箱只需三步，把 AI 项目搞崩只需一步 —— 那就是一次让 AI 干所有事。"*
*—— WeGO 开发宪法第一条*
