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

## 8. 域名与 HTTPS（示例：`zhangxianyue.cn`）

### 8.1 DNS

在域名注册商或阿里云 DNS 解析中添加：

| 记录类型 | 主机记录 | 记录值 |
|---------|---------|--------|
| `A` | `@` | ECS **公网 IPv4** |
| `A`（可选） | `www` | 同上 |

生效一般几分钟到数小时。本机可先测：`dig +short zhangxianyue.cn`。

### 8.2 备案（`.cn` + 大陆 ECS 对外网站）

若 ECS 在**中国大陆**，用该域名提供**对外 Web 服务**，通常需完成 **ICP 备案**（阿里云控制台「备案」流程）。备案期间按当地规则可能限制 80/443 访问，以控制台提示为准。

### 8.3 申请证书并开 443

任选其一：

- **Let’s Encrypt（推荐，免费）**：在 ECS 上安装 `certbot`，用 **webroot** 或 **standalone** 校验（需临时占用 80，或与现有 Nginx 配合）。证书路径常见为 `/etc/letsencrypt/live/zhangxianyue.cn/`。
- **阿里云免费 DV 证书**：在 SSL 证书控制台申请，下载 Nginx 格式，上传到 ECS（如 `/etc/nginx/ssl/`）。

### 8.4 Nginx 443（与 Docker 并存的一种做法）

当前 Compose 内 Nginx 监听 **80**。常见做法：

1. **宿主机 Nginx** 监听 `443`，SSL 终止后把 HTTP 反代到 `127.0.0.1:80`（即 Compose 暴露的 80 端口）；或  
2. 改 Compose 中 Nginx 配置，挂载证书并增加 `listen 443 ssl`，再 `docker compose up -d` 重建。

无论哪种，浏览器访问应为：`https://zhangxianyue.cn`。

### 8.5 应用内 URL（务必与域名一致）

- `docker-compose.yml` 里 **backend** 的 `PUBLIC_BASE_URL`：`https://zhangxianyue.cn`
- 各页面 `window.__WEGO_API_CONFIG__.apiBaseUrl`：`https://zhangxianyue.cn`（与站点同源时也可用 `location.origin`，见第 6 节）
- 若 Admin 使用 Supabase 等外链，按页面实际配置检查是否仍指向 `127.0.0.1`
