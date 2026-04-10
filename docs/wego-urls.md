# WeGO 服务地址速查

本地端口以项目约定为准（勿随意改动，除非同步更新 runbook / compose / env）。  
线上域名与 `docs/path2-ecs-deploy.md` 中 ECS 部署说明一致；若你方生产环境使用其他域名，请改下表并保留团队内单一事实来源。

---

## 本地（本机 `localhost`）


| 用途                     | 地址                                                                   |
| ---------------------- | -------------------------------------------------------------------- |
| 前台（Vite）               | [http://127.0.0.1:5173/](http://127.0.0.1:5173/)                     |
| 后台管理（admin dev server） | [http://127.0.0.1:5174/admin](http://127.0.0.1:5174/admin)           |
| 后端 API（Node）           | [http://127.0.0.1:8787](http://127.0.0.1:8787)                       |
| 健康检查                   | [http://127.0.0.1:8787/healthz](http://127.0.0.1:8787/healthz)       |
| 路线列表示例                 | [http://127.0.0.1:8787/api/routes](http://127.0.0.1:8787/api/routes) |


---

## 局域网（手机 / 同 WiFi 调试）

将「你的局域网 IP」换成本机 IPv4（如 `192.168.1.10`）：


| 用途   | 地址                              |
| ---- | ------------------------------- |
| 前台   | `http://<你的局域网IP>:5173/`        |
| 后台   | `http://<你的局域网IP>:5174/admin`   |
| 健康检查 | `http://<你的局域网IP>:8787/healthz` |


启动命令见 `docs/local-dev-runbook.md`（`dev:lan`、`admin:dev:lan`、`backend:dev`）。

---

### 生产环境入口（推荐）

| 用途              | 地址                                                                       |
| ----------------- | -------------------------------------------------------------------------- |
| **站点（HTTPS）** | [https://wego.zhangxianyue.cn](https://wego.zhangxianyue.cn)               |
| 后台管理          | [https://wego.zhangxianyue.cn/admin](https://wego.zhangxianyue.cn/admin)   |
| API 验证（后端）  | [https://wego.zhangxianyue.cn/api/routes](https://wego.zhangxianyue.cn/api/routes) |
| Agent 验证（AI）  | [https://wego.zhangxianyue.cn/chat/stream](https://wego.zhangxianyue.cn/chat/stream) |

### 备用/调试（公网 IP，数字地址）

当前 ECS **公网 IPv4**：`47.95.123.115`（若域名无法解析，可用此 IP 紧急访问，但 HTTPS 证书会失效）。

| 用途              | 地址                                                                           |
| --------------- | ---------------------------------------------------------------------------- |
| 站点（HTTP，80） | [http://47.95.123.115/](http://47.95.123.115/)                               |
| API 验证（80）   | [http://47.95.123.115/api/routes](http://47.95.123.115/api/routes)           |
| 若带 8080 端口   | [http://47.95.123.115:8080/](http://47.95.123.115:8080/)                     |


说明：

- 用 IP 访问时浏览器可能提示证书不匹配（HTTPS + 证书绑的是域名）；可临时用 **HTTP** 或在本机 `hosts` 里把域名指到该 IP 后再用域名访问。
- 后端直连健康检查一般在服务器容器内执行（见 `docs/path2-ecs-deploy.md` 第 10 节）；公网是否暴露 `/healthz` 取决于前置 Nginx/网关与安全组。

---

## 相关文档

- 本地启动与排障：`docs/local-dev-runbook.md`
- ECS 部署与 HTTPS：`docs/path2-ecs-deploy.md`