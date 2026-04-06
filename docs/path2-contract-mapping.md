# WeGO 路径2契约冻结与能力映射

## 契约冻结

继续以 `contracts/` 为唯一 I/O 约束源，路径2不改变字段命名：

- `route.schema.json`
- `spot.schema.json`
- `checkin.schema.json`
- `route-upload.schema.json`
- `route-ingestion.schema.json`
- `chat-message.schema.json`
- `home-carousel.schema.json`

## Supabase -> 自建后端映射

| Supabase 能力 | 路径2替代 |
|---|---|
| PostgREST 表查询 | `backend/src/server.js` REST API |
| Edge Function `route-ingest` | `POST/GET /api/route-ingest/*` |
| Auth | `/api/auth/register|login|refresh` JWT |
| Realtime | `/api/realtime/checkins` SSE（进程内总线） |
| Storage | `/api/storage/upload` + 本地文件存储 |
| Service Role 内部操作 | `/api/internal/*` + `INTERNAL_API_TOKEN` |

## 关键接口清单

- 前台：
  - `GET /api/routes`
  - `GET /api/routes/:id`
  - `GET /api/routes/:id/spots`
  - `POST /api/checkins`
- 上传编排：
  - `POST /api/route-ingest`
  - `POST /api/route-ingest/:sessionId/gap-reply`
  - `POST /api/route-ingest/:sessionId/confirm`
- 管理端：
  - `GET /api/admin/routes`
  - `POST/PATCH/DELETE /api/admin/routes*`
  - `POST/PATCH/DELETE /api/admin/spots*`
  - `GET/PUT/DELETE /api/admin/carousel-configs*`
- Agent 内部：
  - `GET/PATCH /api/internal/route-drafts/:sessionId`
  - `POST /api/internal/routes/import`

## 兼容约定

- 前端配置统一改为 `window.__WEGO_API_CONFIG__.apiBaseUrl`
- 登录成功后访问令牌写入 `localStorage.wego_access_token`
- Agent 使用：
  - `BACKEND_API_URL`
  - `INTERNAL_API_TOKEN`
