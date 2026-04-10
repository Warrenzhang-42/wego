# WeGO 路径2单机部署（ECS + 域名 + HTTPS）

面向：**已安装 Docker 的 Ubuntu ECS**、域名 **`wego.zhangxianyue.cn`**、需要 **HTTPS**。数据库可选 **Compose 内 PostgreSQL** 或 **阿里云 RDS**。

> 本地联调与同 WiFi 访问请先看：`docs/local-dev-runbook.md`（端口冲突、`.env`、401、数据恢复）。

---

## 0. 整体顺序（建议按序执行）

1. 阿里云：安全组、（可选）RDS、记下 ECS 公网 IP  
2. 域名：DNS A 记录指向 ECS  
3. （大陆机房）ICP 备案  
4. ECS：创建部署用户、克隆代码、改密钥与 `PUBLIC_BASE_URL`  
5. 调整 **Nginx 端口映射**（推荐），宿主机 Nginx 占 80/443  
6. 申请证书（Let’s Encrypt 或阿里云证书）  
7. `docker compose up` → 迁移 → 种子数据  
8. 前端 `apiBaseUrl` 改为生产域名并（可选）重建/刷新页面缓存  

---

## 1. 阿里云 ECS

### 1.1 规格

- 建议 **4C8G** 起步；线上用户增多可升配。

### 1.2 安全组入方向（生产）

| 端口 | 来源 | 说明 |
|------|------|------|
| **22** | 你的办公公网 IP / 跳板机 | SSH |
| **80** | `0.0.0.0/0` | HTTP（证书校验、跳转 HTTPS） |
| **443** | `0.0.0.0/0` | HTTPS |

**不要**对 `0.0.0.0/0` 放行：`5432`、`8000`、`8787`（数据库与后端端口仅内网或本机使用）。

### 1.3 记下信息

- ECS **公网 IPv4**（配置 DNS 用）  
- 是否 **大陆地域**（决定是否优先走备案）

---

## 2. 域名 DNS（`wego.zhangxianyue.cn`）

在域名注册商或 **阿里云云解析 DNS** 中新增：

| 类型 | 主机记录 | 记录值 |
|------|----------|--------|
| A | `@` | ECS 公网 IPv4 |
| A | `www` | 同上（可选，与下面证书域名一致） |

验证（任意电脑终端）：

```bash
dig +short wego.zhangxianyue.cn A
```

应返回你的 ECS 公网 IP。

---

## 3. ICP 备案（`.cn` + 大陆 ECS）

- 若 ECS 在**中国大陆**，用该域名提供**对外网站**，一般需完成 **阿里云备案**。  
- 按控制台「备案」向导提交；审核期间可能对 80/443 访问有限制，以短信/控制台为准。  
- 香港/海外地域通常无中国大陆备案要求，但证书与合规策略以你业务为准。

---

## 4. 数据库选型

### 4.1 方案 A：Compose 内 PostgreSQL（简单、省运维）

使用仓库自带 `docker-compose.yml` 中的 `postgres` 服务（镜像已含 **pgvector**）。  
**务必**修改 `POSTGRES_PASSWORD` 与 `DATABASE_URL` 中的密码，且 **不要将 5432 暴露到公网**（可删掉 compose 中 `ports: "5432:5432"`，仅容器内访问）。

### 4.2 方案 B：阿里云 RDS PostgreSQL（推荐正式环境）

1. 创建 **RDS PostgreSQL**，大版本 **≥ 14**，在控制台启用 **pgvector（vector）** 扩展（参见阿里云「pgvector 使用指南」）。  
2. 白名单：仅允许 **ECS 私网 IP** 或 **ECS 所在 VPC**。  
3. 在 RDS 上创建数据库与用户，得到连接串，例如：  
   `postgresql://USER:PASS@rm-xxxx.pg.rds.aliyuncs.com:5432/wego`  
4. 部署时 **不要再启动 compose 里的 postgres**，并给 `backend`（及需要直连库的 `agent`，若将来有）设置同一 `DATABASE_URL`。  
   - 做法：复制一份 `docker-compose.yml` 为 `docker-compose.override.yml`（勿提交密钥），删掉 `postgres` 服务、去掉 `backend`/`agent` 对 `postgres` 的依赖，并把 `DATABASE_URL` 指向 RDS。  
5. 若 RDS 要求 SSL，在连接串末尾按阿里云文档增加 `?sslmode=require`（或等价参数）。

---

## 5. ECS 上准备代码（Git）

使用非 root 部署（示例用户 `deploy`）：

```bash
sudo adduser deploy
sudo usermod -aG docker deploy
sudo su - deploy
```

克隆（将下方 URL 换成你的仓库地址）：

```bash
git clone https://github.com/YOUR_ORG/WeGO.git
cd WeGO
cp env.example .env
```

编辑 **`.env`** 与 **`docker-compose.yml`** 中与生产相关的项（**不要用仓库默认密钥**）：

- `JWT_SECRET`、`JWT_REFRESH_SECRET`：长随机字符串  
- `INTERNAL_API_TOKEN`：长随机字符串（backend 与 agent 需一致）  
- `POSTGRES_PASSWORD` + `DATABASE_URL`（方案 A）或仅 `DATABASE_URL`（方案 B）  
- **`docker-compose.yml` 里 `backend.environment.PUBLIC_BASE_URL`**：`https://wego.zhangxianyue.cn`  

`env.example` 供本地参考；**Compose 实际以 `docker-compose.yml` 里 `environment` 为准**，请两处不要互相矛盾。

---

## 6. 推荐端口架构（宿主机 HTTPS + 容器仅本机）

Compose 里 Nginx 若映射 **`80:80`**，会与宿主机申请证书、续期时占用 **80** 冲突。推荐：

1. 把 **`docker-compose.yml`** 中 **nginx** 的端口改为只监听本机（示例 **8080**）：

```yaml
    ports:
      - "127.0.0.1:8080:80"
```

2. **去掉**（或注释）`backend`、`agent` 对外映射，仅本机调试时再打开：

```yaml
    # ports:
    #   - "8787:8787"
```

```yaml
    # ports:
    #   - "8000:8000"
```

3. **postgres** 不要向公网映射端口（删掉 `ports: "5432:5432"` 更安全）。

修改后保存；先**不要**长期启动占用 80 的容器，直到宿主机 Nginx 配好（或按第 7 节用 standalone 申请证书时再临时停服务）。

---

## 7. HTTPS 证书

### 7.1 Let’s Encrypt（Certbot，免费）

在 ECS（Ubuntu）上：

```bash
sudo apt update
sudo apt install -y certbot
```

**若当前没有任何程序占用 80**（已按第 6 节把 Docker Nginx 绑到 8080）：

```bash
sudo certbot certonly --standalone -d wego.zhangxianyue.cn
```

若 **80 仍被占用**，可二选一：临时 `docker compose stop nginx` 再执行上面命令；或改用 **阿里云 DNS 验证插件** / **手动 DNS TXT**（见 Certbot 文档）。

证书默认路径：

- `/etc/letsencrypt/live/wego.zhangxianyue.cn/fullchain.pem`  
- `/etc/letsencrypt/live/wego.zhangxianyue.cn/privkey.pem`  

自动续期：

```bash
sudo systemctl enable certbot.timer   # 若发行版提供
# 或加入 cron：sudo certbot renew --quiet && sudo systemctl reload nginx
```

续期后需 **reload 宿主机 Nginx**。

### 7.2 阿里云免费 DV 证书

在 **SSL 证书控制台** 申请域名证书，下载 **Nginx** 格式，上传到 ECS（例如 `/etc/nginx/ssl/wego.zhangxianyue.cn.pem` 与 `.key`），在下面 Nginx 配置里把 `ssl_certificate` 路径改成你的文件路径。

---

## 8. 宿主机 Nginx（443 终止 TLS → 反代到 Docker 8080）

安装：

```bash
sudo apt install -y nginx
```

新建站点配置（路径因发行版可能为 `/etc/nginx/sites-available/wego`）：

```nginx
# HTTP：ACME 可选 + 跳转 HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name wego.zhangxianyue.cn;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name wego.zhangxianyue.cn;

    ssl_certificate     /etc/letsencrypt/live/wego.zhangxianyue.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wego.zhangxianyue.cn/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }
}
```

若使用 **webroot** 方式申请证书，需：

```bash
sudo mkdir -p /var/www/certbot
# certbot certonly --webroot -w /var/www/certbot -d wego.zhangxianyue.cn
```

启用配置并重载：

```bash
sudo ln -sf /etc/nginx/sites-available/wego /etc/nginx/sites-enabled/wego
sudo nginx -t && sudo systemctl reload nginx
```

---

## 9. 启动 WeGO 与数据库初始化

在仓库根目录（`deploy` 用户）：

```bash
docker compose up -d --build
docker compose exec backend npm run backend:migrate
docker compose exec backend npm run backend:seed
```

种子管理员可用环境变量覆盖（执行前 export 或在 compose 中为 `backend` 增加环境变量）：

- `SEED_ADMIN_EMAIL`  
- `SEED_ADMIN_PASSWORD`  

---

## 10. 健康检查

```bash
# 直连 backend 容器映射已关闭时，用 exec：
docker compose exec backend wget -qO- http://127.0.0.1:8787/healthz

# 经宿主机 HTTPS（证书 OK 后）
curl -sS https://wego.zhangxianyue.cn/api/routes | head
```

---

## 11. 前端生产地址（必改）

以下 HTML/JS 中若仍为 `http://127.0.0.1:8787`，请改为与线上一致（推荐 **`https://wego.zhangxianyue.cn`**，或与站点同源时用 **`location.origin`**）：

- `src/index.html`  
- `src/ai-chat.html`  
- `src/route-detail.html`  
- `src/search.html`  
- `src/admin-routes.html`（含 Supabase 等与 Admin 相关配置时一并检查）  

搜索替换示例（在仓库根执行，**提交前请 diff 检查**）：

```bash
rg "127.0.0.1:8787" src/
```

容器内静态文件来自挂载的 `./src`，改完后**刷新浏览器强缓存**或重启 `nginx` 容器。

---

## 12. Agent 与对话

- Compose 内 **Nginx** 已将 `/chat` 反代到 **agent:8000**；前端 `src/lib/chat-client.js` 使用同源路径 **`/chat`**，一般无需再写死端口。  
- 在 **agent** 服务上配置好大模型等环境变量（按 `agent` 目录说明），否则对话会失败。

---

## 13. 运维与备份

- 仅开放 **22 / 80 / 443** 到公网；定期 `apt upgrade` 与 Docker 镜像更新。  
- **PostgreSQL**：Compose 方案定期备份 volume 或 `pg_dump`；RDS 使用控制台自动备份。  
- 关注磁盘（上传图片）、内存与 Nginx/容器日志。

---

## 14. 常见问题

| 现象 | 排查 |
|------|------|
| 证书申请失败 | 80 是否被占用；DNS 是否已指向本机；防火墙是否放行 80 |
| 502 Bad Gateway | 宿主机 Nginx 的 `proxy_pass` 是否指向 `127.0.0.1:8080`；`docker compose ps` 是否 healthy |
| 前端仍访问 127.0.0.1 | 第 11 节是否已改；浏览器是否缓存旧 JS |
| 数据库连接失败 | `DATABASE_URL`；RDS 白名单；是否误将 5432 暴露公网被墙 |

---

## 附录：本地开发（对照）

- 本地仍可用 `npm run dev`（Vite）与 `docker compose` 混合；生产以 **HTTPS 域名 + 第 6 节端口架构** 为准。
