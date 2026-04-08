# WeGO 本地开发运行与排障 Runbook

适用场景：本地开发、同 WiFi 手机访问、后台管理页调试。

## 1) 标准启动顺序（推荐）

在项目根目录执行：

```bash
# 1. 数据库（Docker）
docker compose up -d postgres

# 2. 后端迁移（首次或表结构变更后）
npm run backend:migrate

# 3. 后端服务（局域网可访问）
npm run backend:dev

# 4. 前台（局域网可访问）
npm run dev:lan

# 5. 后台（需要时）
npm run admin:dev:lan
```

访问地址：

- 前台：`http://<你的局域网IP>:5173/`
- 后台：`http://<你的局域网IP>:5174/admin`
- 健康检查：`http://<你的局域网IP>:8787/healthz`

---

## 2) 启动前检查清单（避免“昨天能用今天不能用”）

1. Docker Desktop 已启动（`docker info` 能通过）
2. `.env` 存在且 `DATABASE_URL` 正确
3. 端口未冲突（至少检查 `8787/5173/5174`）
4. 后端脚本必须加载 `.env`（已使用 `node -r dotenv/config ...`）

可用命令：

```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN
lsof -nP -iTCP:5174 -sTCP:LISTEN
```

---

## 3) 常见故障与处理

### A. `EADDRINUSE`（端口被占用）

现象：后端/前端/后台启动时报端口已占用。

处理：

```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN
kill <PID>
# 若仍占用
kill -9 <PID>
```

> 备注：若你在用 Docker 的 backend，就不要再起一个本地 `npm run backend:dev`（二选一）。

### B. `DATABASE_URL is empty`

现象：后端日志提示数据库连接为空。

处理：

1. 确认有 `.env`（没有就 `cp env.example .env`）
2. 检查 `.env` 的 `DATABASE_URL`
3. 确认启动脚本带 `-r dotenv/config`

### C. 后台报 `Missing bearer token`（401）

现象：后台 `/api/admin/*` 请求 401。

原因：后台接口必须携带 `Authorization: Bearer <token>`。

处理：

1. 先确保管理员账号已存在：`npm run backend:seed`
2. 后台页面登录后会写入 `localStorage` 的 `wego_access_token`
3. 若仍 401，清理浏览器本地 token 后重登

### D. 迁移报 `postgis is not available`

现象：`npm run backend:migrate` 失败，提示缺少 PostGIS。

处理：

- 使用支持 PostGIS 的数据库镜像/实例。
- 本地若使用容器且缺包，需要为该容器补装 PostGIS 后再迁移。

---

## 4) 数据恢复（本地误重建后）

如果本地库被重建导致数据丢失，可从仓库种子数据恢复：

1. 先跑迁移：`npm run backend:migrate`
2. 再恢复路线与景点（按项目当前恢复脚本/命令）
3. 最后刷新后台确认 `routes/spots` 数量

> 注意：这是“种子恢复”，不是“时间点备份回滚”。若要精准回滚，需要数据库备份。

---

## 5) 建议的日常习惯

- 每次改本地网络访问模式（`127.0.0.1` ↔ `0.0.0.0`）后，先做一次端口检查。
- 对本地数据库做周期性备份（至少每日一次），避免仅依赖种子恢复。
- 遇到“页面空白/加载失败”，先看接口状态码，再看后端日志，不要先改前端代码。
