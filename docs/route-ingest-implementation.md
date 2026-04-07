# route-ingest Edge Function（实现索引）

> **源码路径**：`server/functions/route-ingest/index.js`  
> 本文供 OpenClaw / 向量记忆检索用；行为以仓库内源码为准。

## 角色

Supabase Edge Function（Deno）上的**薄代理**：把浏览器/客户端请求转发到自建后端 `BACKEND_API_URL`，路径映射到后端的 `/api/route-ingest/*`。自身不做解析或落库逻辑。

## 环境变量

| 变量 | 作用 |
|------|------|
| `BACKEND_API_URL` | 后端根地址（必填）；与下方 pathname 拼接为完整 URL |
| `INTERNAL_API_TOKEN` | 可选；当请求未带 `Authorization` 时，以 `Bearer ${INTERNAL_API_TOKEN}` 转发 |

## HTTP 与路径映射

| 入口（Edge URL pathname） | 方法 | 转发到后端 |
|---------------------------|------|------------|
| `.../gap-reply`（UUID 段 + `/gap-reply`） | `POST` | `POST /api/route-ingest/{sessionId}/gap-reply` |
| `.../confirm`（UUID 段 + `/confirm`） | `POST` | `POST /api/route-ingest/{sessionId}/confirm` |
| `.../{uuid}`（仅 UUID 段结尾） | `GET` | `GET /api/route-ingest/{sessionId}` |
| 根路径（POST，无上述子路径） | `POST` | `POST /api/route-ingest` |
| 任意 | `OPTIONS` | 返回 `{ ok: true }`（CORS 预检） |

UUID 由正则 `[a-f0-9-]{36}` 捕获（大小写不敏感）。

## CORS 与响应

- 统一附加 `Access-Control-Allow-Origin: *` 等 `corsHeaders`。
- `jsonResp` 用于 JSON 小响应；代理分支将后端 `res.text()` 原样包成 `Response`，并带上 JSON `Content-Type` 与 CORS 头。

## 错误与边界

- `BACKEND_API_URL` 未配置：`proxyToBackend` 抛错。
- 非上述路由且非 OPTIONS：`405`，`{ error: 'Method Not Allowed' }`。
- `req.json()` 失败时体视为 `{}`。

## 相关契约与文档

- 业务 JSON 形状：`contracts/route-ingestion.schema.json`
- 发布与迁移：`docs/route-upload-release-checklist.md`
- 总体设计：`WeGO_Technical_Solution.md` 中 Edge Function 章节
