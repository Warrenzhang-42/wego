# WeGO AI 本地导览 - 技术方案选型文档 (v3)

> 基于 2026-04-01 多轮讨论及 Gemini 外部评审反馈更新。整合多地图接入、渐进式 Native 迁移策略、RAG 架构细化及 Agent 编排设计。

---

## 0. 总体架构概览

```
+-------------------------------------------------------------+
|                      用户设备 (手机浏览器)                      |
|  +-----------+  +--------------+  +-----------------------+ |
|  |  地图模块   |  |  AI 对话模块  |  |  打卡 / 旅程记录模块   | |
|  |(多引擎适配) |  | (语音+文字)  |  |                       | |
|  +-----+-----+  +------+-------+  +-----------+-----------+ |
|        |               |                      |             |
|  +-----v---------------v----------------------v-----------+ |
|  |           WeGO Map Adapter (统一抽象层)                  | |
|  |     Mapbox  |  高德 AMap  |  百度 BMap  (用户可切换)      | |
|  +-----+---------------+----------------------+-----------+ |
|        | Geolocation    | watchPosition        |             |
|        | Geofencing     | 距离计算              |             |
+--------+---------------+----------------------+-------------+
         |               |                      |
    +----v---------------v----------------------v----+
    |              Supabase (BaaS 后端)               |
    |  +----------+ +----------+ +----------------+  |
    |  |PostgreSQL| | pgvector | | Edge Functions |  |
    |  |(关系数据) | |(向量检索) | | (Agent 逻辑)   |  |
    |  +----------+ +----------+ +-------+--------+  |
    |  +----------+ +----------+         |           |
    |  |  Auth    | | Realtime |    SSE 流式推送      |
    |  |(用户认证) | |(实时订阅) |         |           |
    |  +----------+ +----------+         |           |
    +------------------------------------+-----------+
                                         |
                              +----------v----------+
                              |   LLM API 调用层     |
                              |  Claude / GPT-4o    |
                              |  + Tool-calling     |
                              +---------------------+
```

---

## 1. 地图模块：多引擎适配架构

### 1.1 选型结论：三图全接入，用户可切换

WeGO 同时对接 **Mapbox**、**高德 AMap**、**百度 BMap** 三款地图引擎，由用户在设置中自主选择。

#### 各引擎定位

| 引擎 | 优势 | 劣势 | 最佳场景 |
| :--- | :--- | :--- | :--- |
| **Mapbox** | 视觉定制力最强（Studio 自定义样式），国际覆盖好 | 国内底图精度有限，加载速度受 CDN 影响 | 追求设计感的用户 / 海外路线 |
| **高德 AMap** | 国内 POI 数据最全，步行导航精度最高，合规 | 视觉自定义能力弱，国际路线不支持 | 国内场景默认推荐 |
| **百度 BMap** | 国内用户基数大，街景数据丰富 | BD-09 坐标系独立，API 设计老旧 | 需要街景能力的场景 |

### 1.2 核心挑战：坐标系统差异

三家地图使用不同坐标系，这是多引擎架构中最关键的技术难题：

| 坐标系 | 使用方 |
| :--- | :--- |
| **WGS-84** (国际标准) | Mapbox, GPS 原始数据 |
| **GCJ-02** (火星坐标) | 高德 AMap, 腾讯地图 |
| **BD-09** (百度偏转) | 百度 BMap |

**解决方案**：
- 后端数据库统一存储 **WGS-84** 坐标（这是 PostGIS 的标准 SRID 4326）。
- 前端使用 [gcoord](https://github.com/hujiulong/gcoord) 库，在渲染时按引擎实时转换。
- 所有 API 请求/响应经过 Adapter 层标准化后再传入业务逻辑。

### 1.3 统一抽象层设计 (Map Adapter Pattern)

采用 **适配器模式（Adapter Pattern）** 构建统一接口，业务代码不直接调用任何地图 SDK：

```javascript
// 伪代码示意 - WeGO Map Adapter 统一接口
class WeGOMap {
  constructor(provider, containerEl, options) {
    // provider: 'mapbox' | 'amap' | 'bmap'
    this.adapter = MapAdapterFactory.create(provider, containerEl, options);
  }

  // 统一接口 -- 业务层只调用这些方法
  setCenter(lng, lat, zoom) {}       // 设置中心点
  addMarker(lng, lat, opts) {}       // 添加标记（自动坐标转换）
  addCheckinMarker(lng, lat, opts){} // 添加打卡标记（发光勋章样式）
  drawRoute(coords, style) {}       // 绘制路线（Polyline）
  addGeofence(lng, lat, radius, onEnter) {} // 添加地理围栏
  fitBounds(bounds) {}               // 自适应视野
  onMapClick(callback) {}            // 地图点击事件
  getCurrentProvider() {}            // 获取当前引擎
  switchProvider(newProvider) {}     // 运行时切换引擎
  planWalkingRoute(origin, dest) {}  // 步行路线规划（调用各引擎 API）
}
```

每个引擎有独立的 Adapter 实现（如 `MapboxAdapter.js`、`AMapAdapter.js`、`BMapAdapter.js`），内部处理坐标转换和 API 差异。

### 1.4 AI 路径规划：三步分离原则

> **核心认知**：LLM 是文本模型，没有空间几何概念。直接让 AI "画路线"会导致严重的空间幻觉（如穿墙、跨河、把相距 50km 的点算作步行 10 分钟）。因此必须将 AI 决策与 LBS 计算严格分离。

```
Step 1: AI 生成节点（LLM 负责）
用户："我想看老北京非遗，半天时间，别太累"
Agent 输出结构化 JSON:
{
  "pois": ["青云阁", "兔儿爷传承店", "乾坤空间"],
  "constraints": { "max_hours": 4, "max_walk_km": 3 }
}

Step 2: LBS 校验与连线（地图 API 负责）
调用 Adapter.planWalkingRoute() 计算：
- 真实步行距离：2.1km (符合 < 3km 约束)
- 预计步行耗时：28 分钟
- 真实经纬度轨迹点集合 (Polyline coordinates)

Step 3: 约束校验 + 前端渲染
Agent 校验：停留时间(45+35+30=110min) + 步行(28min) = 138min < 240min
-> 通过！生成口语化路线建议
-> 前端通过 Adapter.drawRoute() 渲染真实轨迹线
```

### 1.5 打卡记录在地图中标记

- 用户触发打卡 -> 前端获取当前 GPS 坐标 -> 调用 `save_checkin` 写入 `user_checkins` 表。
- 地图层通过 Adapter 的 `addCheckinMarker()` 方法，将已打卡点渲染为**特殊样式的 Marker**（如发光勋章、点亮动效）。
- 利用 Supabase Realtime 订阅 `user_checkins` 表变更，实现多端同步刷新。
- 下次打开地图时，前端请求该用户的打卡历史坐标，批量渲染打卡标记。

### 1.6 首页城市上下文（定位、手动选择与回访提示）

**目标**：顶部展示「当前浏览城市」；首访用 **WGS-84** 单次 `getCurrentPosition` 解析城市（`resolveCityFromWgs84`，与 `src/lib/admin-route-cities.js` 中运营配置的近似矩形边界一致）；拒绝或失败时落默认 **北京市（110000）**。用户可通过 `city-select.html` 手动改城并写回 `localStorage`。

**契约**：`contracts/user-city-preference.schema.json` 描述 `selected_city_adcode`、`last_visit_at` 及可选的 `mismatch_snooze`（冷却对象）。

**长时间未访问**：若 `Date.now() - last_visit_at` 超过 **7 天**（可配置常量 `STALE_VISIT_MS`），且定位解析城市与已选 `adcode` 不同，则展示底部 **modal sheet**（`role="dialog"`）：主按钮「切换至定位城市」并 `location.reload()` 以刷新列表；次按钮「保持当前城市」写入 snooze（同对已选/定位组合 **7 天内**不再弹）。点击遮罩或 `Escape` 与「保持」等价，避免误切城。

**实现文件**：`src/lib/city-preference.js`（编排）、`src/app.js` 入口 `initHomeCity()`、`index.html` 顶部按钮与弹层 DOM。

---

## 2. 知识库架构：RAG (检索增强生成)

### 2.1 知识库构建流程

```
原始内容（Markdown / JSON / 采编文本）
       |
       v
  文本切片（Chunking）
  按景点/主题/段落切分，每 chunk 300-500 token
  保留 metadata: spot_id, chunk_type, 坐标
       |
       v
  Embedding 向量化
  主选: OpenAI text-embedding-3-small (1536 维)
  备选: BGE-m3 (中文语义优化, 开源可自建)
       |
       v
  存入 Supabase (pgvector)
  每条记录: chunk_text + embedding + metadata(spot_id, 类型, 坐标)
```

### 2.2 Embedding 模型选型

| 模型 | 维度 | 优势 | 劣势 |
| :--- | :--- | :--- | :--- |
| **OpenAI text-embedding-3-small** | 1536 | 多语言好，API 调用简单 | 依赖外部 API，有成本 |
| **BGE-m3** (BAAI) | 1024 | 中文语义理解最优，开源免费 | 需自建推理服务 |

**结论**：MVP 阶段使用 OpenAI Embedding API 快速验证，当知识库规模增长后评估迁移至 BGE-m3 自建以降低成本。

### 2.3 知识库数据来源与结构

| 数据类型 | 示例 | 存储方式 |
| :--- | :--- | :--- |
| **景点深度介绍** | 青云阁历史、兔儿爷非遗故事 | 结构化 Chunks + Vector |
| **路线元信息** | 路线名称、时长、难度、标签 | 关系表 `routes` |
| **传承人档案** | 张忠强老师师承、创作特点 | 结构化 Chunks + Vector |
| **实时信息** | 门票价格、营业时间、排队状况 | 外网搜索 (Agent Tool) |

### 2.4 检索策略：三重混合检索 (Hybrid Search)

单纯的向量搜索或关键词搜索都有局限。WeGO 采用**三重混合检索**确保"所见即所听"：

1. **语义搜索 (Vector Search)**：用户问"这条街有什么有趣的故事" -> 语义匹配深度内容。
2. **空间过滤 (Spatial Filter)**：只返回当前位置 500 米内的知识片段（利用 PostgreSQL PostGIS）。
3. **关键词增强 (Full-text Search)**：对专有名词（如"兔儿爷"、"青云阁"）做精确匹配补充。

```sql
-- 示例：三重混合检索 SQL（Supabase pgvector + PostGIS + tsvector）
SELECT
  chunk_text,
  1 - (embedding <=> $query_vector) AS semantic_score,
  ts_rank(tsv, plainto_tsquery('chinese', $keyword)) AS keyword_score
FROM knowledge_embeddings
WHERE
  -- 空间过滤：只要 500 米内的知识
  ST_DWithin(
    geom,
    ST_SetSRID(ST_MakePoint($user_lng, $user_lat), 4326),
    500
  )
ORDER BY
  (0.7 * (1 - (embedding <=> $query_vector))) +
  (0.3 * ts_rank(tsv, plainto_tsquery('chinese', $keyword))) DESC
LIMIT 5;
```

---

## 3. 数据库设计

### 3.1 选型结论：Supabase (PostgreSQL + pgvector + PostGIS)

**"一库流"最优解** -- PostgreSQL 一个数据库同时承担关系存储、向量检索与空间计算三大职责，大幅降低初期运维多套数据库的成本。

**综合评估**：

| 考量维度 | Supabase | MongoDB Atlas | 评估 |
| :--- | :--- | :--- | :--- |
| **开发效率** | 自带 Auth/Realtime/Storage/Edge Functions | 需额外集成 | Supabase 胜 |
| **向量检索** | pgvector，与关系数据同库 | Atlas Vector Search | 持平 |
| **空间查询** | PostGIS (业界标准，与坐标系方案天然契合) | $geoNear | Supabase 胜 |
| **JS 生态** | `@supabase/supabase-js` 一流 | Mongoose/驱动成熟 | 持平 |
| **成本** | 免费层足够 MVP | 免费层较小 | Supabase 胜 |
| **灵活存储** | JSONB 存储 Agent 结构化卡片/交互历史 | 原生文档模型 | 持平 |
| **扩展性** | 垂直扩展为主 | 水平分片原生支持 | MongoDB 胜 |

**结论**：WeGO 当前阶段（MVP -> 早期验证），Supabase 的"全家桶"体验显著降低开发成本。当用户规模突破百万级时再评估是否迁移。

### 3.2 核心表结构设计

> **权威 DDL**：以 `server/migrations/` 为准（`001_routes`、`002_spots`、`005_routes_engagement`、`008_admin_route_editor`、`009_route_versions_rls`）。下表为逻辑字段摘要。

```sql
-- 路线表（摘要；已无 difficulty，含分类/热度/可见性/发布版本等）
CREATE TABLE routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  duration_minutes INT,
  tags TEXT[],
  category TEXT,                    -- 首页 Chip / 运营分类（005）
  cover_image TEXT,
  total_distance_km NUMERIC(6,3),
  heat_level INT,
  heat_count INT,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  thumbnail_image TEXT,
  published_version INT NOT NULL DEFAULT 0,
  last_published_at TIMESTAMPTZ,
  draft_saved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 景点表（摘要；库中为 lat/lng NUMERIC，非 PostGIS geom）
CREATE TABLE spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID REFERENCES routes(id),
  name TEXT NOT NULL,
  subtitle TEXT,
  short_desc TEXT,
  detail TEXT,
  rich_content TEXT,
  tags TEXT[],
  thumb TEXT,
  photos TEXT[],
  lat NUMERIC NOT NULL,
  lng NUMERIC NOT NULL,
  geofence_radius_m INT DEFAULT 30,
  estimated_stay_min INT,
  sort_order INT NOT NULL,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  is_easter_egg BOOLEAN NOT NULL DEFAULT false,
  spot_type TEXT NOT NULL DEFAULT 'attraction',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 发布快照（008）：每次「发布」写入一条 JSONB 契约形状
CREATE TABLE route_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  snapshot JSONB NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (route_id, version_number)
);

-- 知识库向量表
CREATE TABLE knowledge_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_id UUID REFERENCES spots(id),
  chunk_text TEXT NOT NULL,
  chunk_type TEXT,                   -- 'history' | 'craft' | 'story' | 'tips'
  embedding VECTOR(1536),           -- pgvector 向量字段
  geom GEOMETRY(Point, 4326),       -- 关联地理坐标（用于空间过滤）
  tsv TSVECTOR,                     -- 全文搜索向量（关键词增强）
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 全文搜索索引
CREATE INDEX idx_ke_tsv ON knowledge_embeddings USING GIN(tsv);
-- 空间索引
CREATE INDEX idx_ke_geom ON knowledge_embeddings USING GIST(geom);
-- 向量索引（HNSW，高性能近似最近邻）
CREATE INDEX idx_ke_embedding ON knowledge_embeddings
  USING hnsw(embedding vector_cosine_ops);

-- 用户打卡记录
CREATE TABLE user_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  spot_id UUID REFERENCES spots(id),
  checkin_at TIMESTAMPTZ DEFAULT now(),
  location GEOMETRY(Point, 4326),
  ai_summary TEXT,                  -- Agent 生成的专属感悟
  photos TEXT[]
);

-- Agent 对话记录
CREATE TABLE agent_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  route_id UUID REFERENCES routes(id),
  session_id UUID,                  -- 同一次旅程的会话 ID
  role TEXT CHECK (role IN ('user', 'ai', 'system')),
  content TEXT NOT NULL,
  inserts JSONB,                    -- 知识卡片、推荐等结构化插入
  trigger_type TEXT,                -- 'user_input' | 'geofence' | 'proactive'
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 4. Agent 核心能力

### 4.1 Agent 框架选型：LangGraph (LangChain)

| 框架 | 适合场景 | WeGO 契合度 |
| :--- | :--- | :--- |
| **LangChain / LangGraph** | 多步骤编排、Tool-calling、状态管理 | ★★★★★ |
| **LlamaIndex** | 复杂文档索引、企业知识库检索 | ★★★★ |

**选型结论**：WeGO Agent 的核心挑战在于**多工具编排**（地图 + 知识库 + 外网）与**状态驱动的对话**，而非海量文档的深度索引。因此主选 **LangGraph** 做 Agent 编排。

> **混合方案备选**：如果后期知识库规模膨胀到万级文档，可引入 LlamaIndex 做检索层，再暴露为 LangGraph 的 Tool。两者非互斥关系。

### 4.2 Agent 工具集 (Tools)

Agent 通过 **Function Calling / Tool-calling** 机制调用以下能力：

| 工具名称 | 功能 | 数据源 |
| :--- | :--- | :--- |
| `search_knowledge(query, location)` | 语义检索知识库 + 空间过滤 | Supabase pgvector + PostGIS |
| `plan_route(pois, preferences)` | 规划最优步行路线 + 约束校验 | 地图 Directions API |
| `web_search(query)` | 搜索即时信息（票价、天气、排队） | Tavily / Exa Search API |
| `get_spot_detail(spot_id)` | 获取景点完整信息 | Supabase spots 表 |
| `save_checkin(spot_id, summary)` | 记录用户打卡 + AI 专属感悟 | Supabase user_checkins |
| `get_user_history(user_id)` | 获取用户历史轨迹与偏好 | Supabase |

### 4.3 自主路线规划逻辑（含约束校验）

```
用户输入："我想看老北京非遗，半天时间，别太累"
                    |
                    v
         Agent 解析意图
         - 区域：大栅栏
         - 主题：非遗
         - 时间约束：max_hours = 4
         - 体力约束：max_walk_km = 3 ("别太累")
                    |
                    v
     search_knowledge("大栅栏 非遗", location)
     -> 返回匹配景点列表 + 每个景点的 estimated_stay_min
                    |
                    v
     plan_route([景点坐标列表], { mode: 'walking' })
     -> 调用地图 API 得到最优排列 + 实际步行距离/耗时
                    |
                    v
     约束校验：
     - 总步行距离 2.1km < 3km (体力约束) -> PASS
     - 总耗时 2.3h < 4h (时间约束) -> PASS
     - 若超出 -> 自动裁减低优先级景点并重新规划
                    |
                    v
     Agent 生成口语化路线建议 + 前端渲染地图路径
```

### 4.4 地理围栏主动触发讲解

**触发机制**：

```javascript
// 前端 Geofencing 监听 (简化伪代码)
const watchId = navigator.geolocation.watchPosition(
  (position) => {
    const { latitude, longitude } = position.coords;

    for (const spot of currentRouteSpots) {
      const distance = haversineDistance(
        latitude, longitude,
        spot.lat, spot.lng
      );

      // 进入景点围栏半径 (默认 30 米) -> 触发 Agent 主动讲解
      if (distance < spot.geofence_radius && !spot.triggered) {
        spot.triggered = true;
        triggerAgentNarration(spot.id, { latitude, longitude });
      }
    }
  },
  null,
  { enableHighAccuracy: true, maximumAge: 5000 }
);
```

**触发后的 Agent 行为**：

1. 调用 `search_knowledge(spot_id)` 获取该景点的深度知识。
2. 结合用户画像（偏好历史、文化，还是美食）选择讲解角度。
3. 以当前导游人格生成口语化讲解。
4. 通过 **SSE (Server-Sent Events)** 流式推送到前端对话界面。
5. 自动展示知识卡片（复用现有的 `ac-knowledge-card` 组件）。
6. 将此次讲解记录写入 `agent_transcripts`，`trigger_type = 'geofence'`。

**触发信号格式**：
```json
{
  "event": "arrived_at",
  "poi_id": "spot_uuid_xxx",
  "user_id": "user_uuid_xxx",
  "user_status": "walking",
  "coordinates": { "lat": 39.8951, "lng": 116.3942 }
}
```

### 4.5 智能意图路由：知识库 + 外网双源

Agent 内置**意图分类器**，自动判断用户问题类型并路由至对应工具：

```
用户提问："兔儿爷为什么骑老虎？"
              |
              v
     Agent 意图分类 -> [知识型问题]
              |
              v
   search_knowledge("兔儿爷 骑虎 坐骑 寓意")
   -> 命中 Local RAG 知识库：虎在传统观念中有辟邪守护功能...
              |
              v
   Agent 生成回答（融入导游人格风格）


用户提问："前面那家卤煮店今天开门吗？"
              |
              v
     Agent 意图分类 -> [即时信息问题]
              |
              v
   web_search("铃木食堂 杨梅竹斜街 营业时间 今天")
   -> Tavily / Exa 搜索最新评价/社交媒体信息
              |
              v
   Agent 综合回答 + 同时从 KB 补充该店的背景推荐
```

| 问题类型 | 路由工具 | 示例 |
| :--- | :--- | :--- |
| 文化/历史/非遗 | `search_knowledge` (Local RAG) | "兔儿爷的历史"、"这条街的来历" |
| 即时/时效性信息 | `web_search` (Tavily/Exa) | "现在排队吗"、"门票多少钱" |
| 路线/导航 | `plan_route` (Map API) | "怎么走最近"、"帮我重新规划" |
| 混合问题 | 先 RAG 再补充 Web | "这家店有什么推荐？现在还营业吗" |

---

## 5. 渐进式 Native 迁移策略

### 5.1 策略结论：Web 先行 -> Capacitor 打包 -> 按需 Native 增强

**先在 Web 端完成核心功能验证，待产品形态稳定后再迁移至 Native App**。

#### 迁移路线图

```
Phase 1 (当前)          Phase 2               Phase 3
Web MVP                Capacitor 打包         Native 增强
--------------------   ------------------     --------------
. 浏览器运行            . 生成 iOS/Android     . 后台定位
. 前台定位监听             App 包               . 息屏语音播报
. 纯 JS 实现            . 99% 代码复用          . 推送通知
. 快速验证核心体验       . 上架应用商店          . 本地 TTS
                       . 基础推送能力          . 高性能地图渲染
```

#### 为什么选 Capacitor 而不是 React Native？

| 维度 | Capacitor | React Native |
| :--- | :--- | :--- |
| **代码复用** | 约99%（直接包裹 Web 代码） | 需重写 UI 层 |
| **迁移成本** | 极低（添加依赖即可） | 高（整体重构） |
| **Web 兼容** | 同一套代码同时跑 Web + App | 需要维护两套 |
| **后台定位** | 通过插件支持 | 原生支持 |
| **适合阶段** | MVP -> 增长期 | 成熟期追求极致体验 |

**结论**：Capacitor 是 WeGO 当前最优解。它允许团队在不改动任何现有代码的前提下，直接打包为 App 并上架，后续按需通过 Capacitor 插件接入后台定位能力。

### 5.2 后台定位与息屏播报的技术路径

当迁移到 Capacitor App 后：

1. **后台定位**：安装 `@capgo/capacitor-background-geolocation` 插件，替代浏览器的 `watchPosition`。
   - Android：需要持久通知（Android 13+ 需 `POST_NOTIFICATIONS` 权限）。
   - iOS：需要 `Always` 位置权限并在 `Info.plist` 中声明。
2. **息屏播报**：使用 Web Speech API (`speechSynthesis`) 或 Capacitor TTS 插件，在地理围栏触发时自动朗读 Agent 讲解。
3. **推送通知**：通过 Capacitor Push Notifications 插件，在息屏时以系统通知引导用户查看 Agent 消息。
4. **HTTP 注意事项**：Android 在后台约 5 分钟后会限制 WebView HTTP 请求，需使用 `CapacitorHttp` 原生 HTTP 插件替代。

---

## 6. 最终技术栈汇总

| 层级 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **前端框架** | Vanilla JS (现有) | 保持现有架构，降低风险 |
| **地图引擎** | Mapbox GL JS + 高德 JS API + 百度 JS API | 三图全接入，Adapter 模式统一 |
| **坐标转换** | gcoord | WGS-84 <-> GCJ-02 <-> BD-09 实时转换 |
| **后端 (BaaS)** | **Supabase** | Auth + PostgreSQL + pgvector + PostGIS + Realtime + Edge Functions |
| **AI Agent 编排** | **LangGraph** (LangChain) | 多工具编排、状态管理、对话流控制 |
| **LLM** | Claude Sonnet 4 / GPT-4o | 处理复杂推理与人格表达 |
| **知识向量化** | OpenAI text-embedding-3-small (MVP) / BGE-m3 (备选) | 中文语义优化备选 |
| **外网搜索** | Tavily API / Exa Search API | 补充即时信息（双选备用） |
| **实时推送** | SSE (Server-Sent Events) | Agent 讲解流式推送 |
| **跨平台打包** | **Capacitor** (Phase 2) | Web -> iOS/Android 零改动打包 |
| **后台定位** | @capgo/capacitor-background-geolocation | Phase 2+ 息屏定位 |

---

## 6.1 路线内容数据清洗与入库流水线（MD -> DB）

### A. 目标与原则

- 输入为运营提供的 Markdown 非结构化资料。
- 输出为可直接展示的结构化路线数据（`routes` + `spots`）。
- 采用“契约先行 + 多重质量闸门 + 幂等发布”策略，避免脏数据进入生产库。

### B. 分层流水线

```
Markdown 原文
   -> parse (AI 抽取)
   -> validate (Schema 校验)
   -> clean (规则清洗)
   -> review (人工审核)
   -> upsert (事务入库)
   -> verify (发布核验)
```

### C. 输入输出契约

- **输入**：`route-source.md`（非结构化）
- **中间产物**：`route-candidate.json`（结构化候选）
- **发布产物**：
  - `routes` 表 1 条（或更新 1 条）
  - `spots` 表 N 条（按 `route_id` 关联）
  - `route_ingestion_jobs` 审计记录 1 条（建议新增）

### D. 清洗规则（最小必选）

1. **结构合法性**：必填字段完整，字段类型正确。
2. **ID 合法性**：`route.id` 与 `spot.id` 必须是 UUID；无 ID 时系统生成并落日志。
3. **地理合法性**：`lat/lng` 必须可解析为 number，范围有效（lat -90~90，lng -180~180）。
4. **业务合法性**：`duration_minutes > 0`，`sort_order` 唯一且连续，`estimated_stay_min` 非负。
5. **分类标准化**：标签同义词归并（例如“city walk”统一为 `Citywalk`）。
6. **展示降级默认值**：封面、热度、分类缺失时使用默认值并打标记待补全。

### E. 入库策略

- 使用服务端（Edge Function/后端脚本）持有 `service role key`。
- 单次写入在事务中完成：
  - upsert `routes`
  - upsert `spots`
- 任一步失败即回滚，避免半写状态。
- 采用幂等键（`route.id`）防止重复提交造成脏重复。

### F. 推荐新增表（审计与回滚）

```sql
CREATE TABLE IF NOT EXISTS route_ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID,
  source_md_path TEXT,
  status TEXT NOT NULL, -- parsed | validated | cleaned | approved | published | failed
  parse_payload JSONB,
  validation_report JSONB,
  clean_report JSONB,
  error_message TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

该表用于追踪“从哪份 Markdown 来、卡在哪一步、谁审批、何时发布”，是生产可运营化的关键。

### G. 与现有脚本协同方式

- `data/scripts/seed-beijing-catalog.js`：继续作为“结构化 JSON -> DB”的入库器。
- 新增“前置处理”脚本链路（建议）：
  - `data/scripts/parse-route-md.js`
  - `data/scripts/validate-route-json.js`
  - `data/scripts/clean-route-json.js`
- 最终由 seed 脚本或后端发布接口执行 upsert。



---

## 6.2 Admin 模块（路线内容管理后台）

### 定位

Admin 模块是 WeGO 内容运营团队（内容审核人员）专用的内容管理工具，面向本地单用户部署场景。与前台产品共用同一个 Supabase 实例，前端直连数据库，权限通过 Service Role Key 隔离。

### 技术架构

```
admin-routes.html          # 独立 HTML 页面（无构建工具，直接浏览器打开）
  ├── src/style-admin.css  # 管理后台样式（复用 WeGO 设计 token）
  └── src/lib/admin-api.js # 管理端 SDK（持有 service_role key，绕过 RLS）
                              └── Supabase（routes / spots 表）
```

### 认证策略

| 环境 | Key 类型 | 所在文件 | 权限 |
|---|---|---|---|
| 前台产品 | Anon Key（公开） | `api-client.js` | 仅读取 routes/spots |
| 管理后台 | Service Role Key（私有） | `admin-api.js` | 完整读写（含修改/删除） |

Service Role Key 写入 `window.__WEGO_API_CONFIG__.supabaseServiceKey`（由 `admin-routes.html` 页面加载时从 `.env` 读取注入）。

### 核心能力矩阵

| 操作 | 路线 | 景点 |
|---|---|---|
| 查看/列表 | title, tags, category, heat_level, heat_count, is_visible, published_version | name, tags, lat/lng, thumb, sort_order, spot_type, is_visible, is_easter_egg |
| 编辑（草稿） | title, description, tags, category, cover_image, is_visible；duration/total_distance/thumbnail 由系统按规则重算 | name, subtitle, short_desc, detail, rich_content, tags, thumb, photos, lat, lng（入库 WGS-84；可选 GCJ-02 录入转换）, geofence_radius_m, estimated_stay_min, sort_order, spot_type, is_visible, is_easter_egg |
| 发布 | 写入 `route_versions` 快照，`published_version`+1，`last_published_at` 更新 | 快照内含当前 spots 契约字段 |
| 删除 | 删除路线（ON DELETE CASCADE） | 删除景点 |
| **不可编辑** | heat_level, heat_count（仅展示）；published_version / last_published_at（仅发布动作写入） | — |

heat_level / heat_count 为 read-only，仅展示。

### 关键约束

- **热度字段保护**：`heat_level` / `heat_count` 在 UI 上不输出编辑控件，代码层面禁止 patch
- **坐标系**：数据库统一 **WGS-84**；管理端可对 **GCJ-02 录入**做转换（`src/lib/coordinate-frame.js`）；前台地图 Adapter 负责展示时转换
- **可见性与彩蛋**：`is_visible=false` 或 `is_easter_egg=true` 的景点不参与路径/距离/时长计算；前台 `api-client.js` 默认列表/地图不展示彩蛋与隐藏点
- **幂等安全**：更新操作使用 Supabase Upsert，避免误覆盖
- **前台 Key 不受影响**：`api-client.js` 仍仅用 anon，不引入 service_role

### route_versions 与 RLS（009）

- **service_role**（`admin-api.js`）：绕过 RLS，发布时可 `INSERT route_versions`。
- **anon**：对 `route_versions` **无策略**，无法读取完整路线 JSON 快照，降低泄露风险。
- **authenticated**：`009_route_versions_rls.sql` 授予 SELECT + INSERT，便于未来「登录编辑者 + 用户 JWT」直连 Supabase；后续可按 `auth.uid()` 或自定义 claim 收紧 `WITH CHECK`。

---

## 6.3 Agent 自助路线上传技术设计

### 6.3.1 定位与设计目标

Agent 自助路线上传是 Sprint 11 的核心功能，旨在实现"用户上传任意格式路线内容 -> Agent 全自动解析、补全、校验 -> 用户二次确认 -> 写入数据库"的闭环。具体设计目标：

- 支持 JSON / Markdown / 纯文本 / URL 抓取四种上传格式
- Agent 自动检测并补全缺失字段（经纬度、标签、停留时长等）
- 客观数据自动查询后展示给用户确认，主观内容以对话方式询问用户
- 全程 Agent 驱动，状态透明，用户始终掌握最终确认权

### 6.3.2 系统架构

```
用户（上传入口）
    │
    ├── AI 对话入口（ChatPanel）
    ├── 独立上传页面（/upload-route）
    └── URL 抓取
    │
    ▼
Supabase Edge Function: route-ingest
    │ POST /functions/v1/route-ingest         （上传入口）
    │ GET  /functions/v1/route-ingest/:id     （查询状态）
    │ POST /functions/v1/route-ingest/:id/confirm（确认写入）
    │
    ▼
Python Agent（LangGraph）
    │
    ├── upload_route（主工具）
    │   ├── parse_json_route()
    │   ├── parse_markdown_route()
    │   ├── parse_text_route()
    │   ├── fetch_url_content()
    │   └── gap_detection()
    │
    ├── auto_query（辅助函数，非 Tool）
    │   ├── auto_query_coordinates()  ──→ 高德 Geocoding API
    │   ├── infer_tags_from_spot()
    │   └── infer_stay_duration()
    │
    └── confirm_route_upload（确认工具）
        ├── upsert_routes()
        ├── upsert_spots()
        └── record_ingestion_job()
    │
    ▼
Supabase 数据库
    ├── routes 表
    ├── spots 表
    ├── route_drafts 表（新增）
    └── route_ingestion_jobs 表（复用）
```

### 6.3.3 新增数据契约

**`contracts/route-upload.schema.json`**（上传请求契约）：

```json
{
  "$id": "route-upload",
  "type": "object",
  "required": ["session_id", "file_type"],
  "properties": {
    "session_id": { "type": "string" },
    "file_type": {
      "type": "string",
      "enum": ["json", "md", "txt", "url"]
    },
    "file_content": { "type": "string" },
    "source_url": { "type": "string", "format": "uri" }
  }
}
```

**`route-ingestion.schema.json` 扩展字段**（Gap 项新增）：

| 字段 | 类型 | 说明 |
|:---|:---|:---|
| `gap_items[].gap_type` | `objective \| subjective` | Gap 分类 |
| `gap_items[].auto_queried` | `boolean` | 是否已自动查询 |
| `gap_items[].suggested_value` | `string \| object` | 查询/推断的建议值 |
| `gap_items[].confidence` | `high \| medium \| low` | 查询置信度 |

### 6.3.4 数据库变更

**新增表：`route_drafts`**

```sql
CREATE TABLE route_drafts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      TEXT        NOT NULL UNIQUE,
  source_file     TEXT,
  source_url      TEXT,
  file_type       TEXT        CHECK (file_type IN ('json', 'md', 'txt', 'url')),
  raw_content     TEXT,
  parsed_data     JSONB,
  status          TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN (
                          'draft', 'parsing', 'gap_filling',
                          'pending_review', 'confirmed', 'active', 'editing'
                        )),
  gap_items       JSONB       DEFAULT '[]',
  user_overrides  JSONB       DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**说明**：
- `session_id` 由 Edge Function 生成，用于串联同一次上传会话的所有状态
- `parsed_data` 存储解析后的 `route-ingestion.schema.json` 格式数据
- `gap_items` 存储当前未处理的 Gap 列表
- `user_overrides` 存储用户在确认时手动修改的字段
- `status` 字段追踪会话全生命周期

### 6.3.5 Agent 工具详细设计

#### upload_route（主工具）

**输入 Schema**：

```python
class UploadRouteInput(BaseModel):
    file_content: str                          # 文件原始内容
    file_type: Literal["json", "md", "txt", "url"]
    source_url: Optional[str] = None            # 仅 url 模式
    session_id: str
```

**输出 Schema**：

```python
class UploadRouteOutput(BaseModel):
    session_id: str
    status: Literal["parsing", "gap_filling", "pending_review", "error"]
    route_preview: Optional[dict]              # route-ingestion 格式
    gaps: Optional[list[GapItem]]
    error_message: Optional[str]

class GapItem(BaseModel):
    spot_name: str
    field: str
    gap_type: Literal["objective", "subjective"]
    suggested_value: Optional[Any]
    auto_queried: bool = False
    confidence: Optional[Literal["high", "medium", "low"]]
```

**内部处理流程**：

```
1. 解析文件
   ├─ json       → parse_json_route()
   ├─ md         → parse_markdown_route()  （LLM 提取结构化信息）
   ├─ txt        → parse_text_route()      （LLM 理解文本并提取）
   └─ url        → fetch_url_content() → parse_text_route()

2. 逐 Spot 校验必填字段（route.schema.json）
   对每个 Spot 检查：id / name / lat / lng / sort_order

3. Gap 分类处理
   ├─ 客观 Gap（lat/lng 缺失）
   │   └─ auto_query_coordinates() → 高德 API 查询
   │       └─ 返回：lat/lng + confidence
   │           → 存入 GapItem，展示给用户确认
   │
   ├─ 客观 Gap（tags 缺失）
   │   └─ infer_tags_from_spot() → LLM 推断
   │       └─ 存入 GapItem，展示给用户确认
   │
   └─ 主观 Gap（subtitle/detail/short_desc 缺失）
       └─ 组织询问话术，返回 GapItem

4. 若所有必填 Gap 均已处理（或用户跳过）→ status = "pending_review"
   若尚有未处理必填 Gap → status = "gap_filling"
   若解析失败 → status = "error"
```

#### confirm_route_upload（确认工具）

**输入 Schema**：

```python
class ConfirmRouteUploadInput(BaseModel):
    session_id: str
    confirmed: bool
    overrides: Optional[dict] = None   # 用户在预览页手动修改的字段
```

**输出 Schema**：

```python
class ConfirmRouteUploadOutput(BaseModel):
    success: bool
    route_id: Optional[str]
    error_message: Optional[str]
```

**内部处理流程**：

```
1. 从 route_drafts 表读取 session_id 对应记录
2. 校验 status（必须是 pending_review）
3. 若 confirmed=True：
   ├─ 执行 upsert_routes(parsed_data)
   ├─ 执行 upsert_spots(route_id, parsed_data.spots)
   ├─ 执行 record_ingestion_job(session_id, report)
   └─ 返回 { success: true, route_id }
4. 若 confirmed=False：
   └─ 更新 status = 'editing'，返回 { success: false }
```

### 6.3.6 坐标系处理

高德地图 Geocoding API 返回的坐标为 **GCJ-02** 格式，需转换为 **WGS-84** 后方可写入数据库。

```python
import gcoord

def auto_query_coordinates(spot_name: str, region: str = "北京") -> dict | None:
    # 1. 调用高德 API（GCJ-02 返回）
    # GET https://restapi.amap.com/v3/geocode/geo
    #     ?key=<AMAP_KEY>&address=<spot_name>&city=<region>

    gcj02_result = amap_response["geocodes"][0]
    gcj02_lng = float(gcj02_result["location"].split(",")[0])
    gcj02_lat = float(gcj02_result["location"].split(",")[1])

    # 2. 转换为 WGS-84（写入数据库用）
    wgs84_lat, wgs84_lng = gcoord.transform(
        [gcj02_lng, gcj02_lat],
        gcoord.GCJ02,
        gcoord.WGS84
    )

    return {
        "lat": round(wgs84_lat, 7),
        "lng": round(wgs84_lng, 7),
        "confidence": "high"
    }
```

> 注：`gcoord` 是成熟的 JS 坐标转换库，Python 端推荐使用 `pycoord` 或直接复用相同转换算法。

### 6.3.7 Edge Function 接口设计

**`POST /functions/v1/route-ingest`**

```
请求：
{
  "session_id": "uuid-xxx",
  "file_type": "json" | "md" | "txt" | "url",
  "file_content": "...",    // 非 url 必填
  "source_url": "..."       // 仅 url 必填
}

响应：
{
  "session_id": "uuid-xxx",
  "status": "parsing" | "gap_filling" | "pending_review" | "error",
  "route_preview": { ... },  // route-ingestion 格式，error 时为 null
  "gaps": [
    {
      "spot_name": "炭儿胡同",
      "field": "lat",
      "gap_type": "objective",
      "suggested_value": { "lat": 39.8961, "lng": 116.3989 },
      "auto_queried": true,
      "confidence": "high"
    }
  ],
  "error_message": null
}
```

**`GET /functions/v1/route-ingest/:session_id`**

```
响应：同上（返回当前会话最新状态）
```

**`POST /functions/v1/route-ingest/:session_id/confirm`**

```
请求：
{
  "confirmed": true,
  "overrides": {
    "title": "京城胡同游（修订版）"
  }
}

响应：
{
  "success": true,
  "route_id": "uuid-yyy",
  "error_message": null
}
```

### 6.3.8 前端组件设计

| 组件 | 文件 | 职责 |
|:---|:---|:---|
| `RouteUploader` | `src/components/RouteUploader.tsx` | 文件上传：拖拽 / 点击 / URL / 粘贴 |
| `GapFillingChat` | `src/components/GapFillingChat.tsx` | 主观 Gap 补全对话渲染 + 用户回复处理 |
| `RoutePreview` | `src/components/RoutePreview.tsx` | 二次确认预览页面 + 三个操作按钮 |
| `upload-route Page` | `src/pages/upload-route/index.tsx` | 整合三个组件，串联完整流程 |
| `ChatPanel` 改动 | `src/components/ChatPanel.tsx` | 增加「上传路线」文件上传入口 |

**独立上传页面流程状态机**：

```
idle → uploading → parsing → gap_filling → pending_review
                                              ↓
                                    ┌─── confirmed → success
                                    └─── editing → gap_filling
```

### 6.3.9 技术约束

- **坐标**：所有写入数据库的 lat/lng 必须是 WGS-84，不得直接写入 GCJ-02
- **契约**：所有跨层调用（Edge Function → Agent → 数据库）必须严格符合 `contracts/route-ingestion.schema.json`
- **不可跳过确认**：Agent 不得在 `pending_review` 状态以外写入数据库
- **幂等写入**：使用 `route.id` 作为 upsert 键，重复上传应更新而非创建重复记录
- **环境变量**：`AMAP_API_KEY` 必须写入 Supabase Vault 或 `.env`，不得硬编码

---

## 7. 开发阶段规划


### Phase 1：Web MVP 核心验证（当前 -> 4 周）
- [ ] 搭建 Supabase 项目，创建核心表结构（含索引）
- [ ] 实现 Map Adapter 抽象层（优先接入高德，国内验证最佳）
- [ ] 构建第一批知识库数据（大栅栏杨梅竹斜街路线 -> Embedding 入库）
- [ ] 接入 LLM API，实现基础 RAG 对话
- [ ] 实现前台地理围栏触发讲解（30m 半径）
- [ ] 实现 SSE 流式推送 Agent 消息

### Phase 2：多引擎 + Agent 增强（4 -> 8 周）
- [ ] 完成 Mapbox / 百度 Adapter 接入
- [ ] 实现 Agent 自主路线规划（含约束校验：时长、步行距离）
- [ ] 增加打卡系统与地图标记联动
- [ ] 上线导游人格选择功能
- [ ] 实现智能意图路由（KB vs Web 双源）

### Phase 3：Capacitor 打包 + 后台能力（8 -> 12 周）
- [ ] 集成 Capacitor，打包 iOS / Android App
- [ ] 接入后台定位插件
- [ ] 实现息屏 TTS 语音播报
- [ ] 上架应用商店

### Phase 4：商业化与生态
- [ ] 集成路线订单支付功能
- [ ] 开启非遗传承人线上店铺模块
- [ ] 知识库规模化，评估迁移 BGE-m3 自建 Embedding
- [ ] 支持全球多语言路线拓展

---

*WeGO - 让 AI 成为你的文化旅行搭档*
