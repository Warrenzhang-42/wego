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

```sql
-- 路线表
CREATE TABLE routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  duration_minutes INT,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  tags TEXT[],
  cover_image TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 景点表
CREATE TABLE spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID REFERENCES routes(id),
  name TEXT NOT NULL,
  subtitle TEXT,
  short_desc TEXT,
  detail TEXT,
  tags TEXT[],
  thumb TEXT,
  photos TEXT[],
  geom GEOMETRY(Point, 4326),       -- PostGIS 地理坐标 (WGS-84)
  geofence_radius_m INT DEFAULT 30, -- 地理围栏触发半径（米）
  estimated_stay_min INT,           -- 建议停留时间（分钟）
  sort_order INT,
  created_at TIMESTAMPTZ DEFAULT now()
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
