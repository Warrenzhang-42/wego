# WeGO 路径2单机部署（ECS/CVM）

## 1. 前提

- ECS/CVM 建议规格：4C8G（100 在线建议 4C16G）
- 已安装 Docker + Docker Compose
- 已放行端口：`80`、`443`、`8787`（可选，仅内网调试）

## 2. 初始化

```bash
cp env.example .env
npm install
```

编辑 `.env`：

- `DATABASE_URL`
- `JWT_SECRET` / `JWT_REFRESH_SECRET`
- `INTERNAL_API_TOKEN`
- `PUBLIC_BASE_URL`

## 3. 启动服务

```bash
docker compose up -d --build
```

## 4. 数据库初始化

```bash
docker compose exec backend npm run backend:migrate
docker compose exec backend npm run backend:seed
```

`backend:seed` 会创建管理员账号（可通过环境变量 `SEED_ADMIN_EMAIL`、`SEED_ADMIN_PASSWORD` 覆盖）。

## 5. 健康检查

```bash
curl http://127.0.0.1:8787/healthz
curl http://127.0.0.1/api/routes
```

## 6. 前端配置

页面使用 `window.__WEGO_API_CONFIG__.apiBaseUrl`，默认本地值为 `http://127.0.0.1:8787`。生产建议改为域名，例如：

```js
window.__WEGO_API_CONFIG__ = {
  apiBaseUrl: 'https://your-domain.com'
}
```

## 7. 生产建议

- 使用 Nginx/Caddy 终止 HTTPS
- 仅对公网开放 `80/443`
- PostgreSQL 定时快照 + `pg_dump`
- 监控磁盘、内存、5xx 比率
