# WeGO 路线上传发布清单

适用范围：`route-ingest` Edge Function + `route_ingestion_jobs` / `route_drafts` 相关改动。

## 0) 发布前准备

- 确认当前目录：`/Users/a111111/Desktop/xianyue_projects/WeGO`
- 确认 Supabase 已登录：`supabase login`
- 确认项目已关联：`supabase link --project-ref <your_ref>`
- 确认本机 `.env` 已配置 `DATABASE_URL` 或 `SUPABASE_DATABASE_URL`

## 1) 执行数据库迁移（先库后代码）

按需执行（仅在表结构变更时需要）：

```bash
npm run migrate:006
npm run migrate:007
```

或一键执行：

```bash
npm run migrate:route-upload
```

如果提示对象已存在（例如 `relation already exists`），说明该迁移已经执行过，可跳过对应步骤。

## 2) 部署 Edge Function

```bash
npm run deploy:route-ingest
```

说明：`WARNING: Docker is not running` 在云端 deploy 场景可忽略。

## 3) 验收检查

1. 启动管理后台：`npm run admin:dev`
2. 在上传页执行一次完整流程（上传 -> Gap 补充 -> 确认入库）
3. 预期结果：
   - 不再出现 `Invalid API key` / `public.route_drafts not found`
   - `route_drafts` 有新记录
   - 最终路线与景点数据成功入库

## 4) 常见报错与处理

- `Draft insert failed: 401 Invalid API key`
  - 检查函数是否已部署最新版本
  - 检查函数是否读取 `SUPABASE_SERVICE_ROLE_KEY`
- `PGRST205 Could not find table public.route_drafts`
  - 先跑 `006`，再跑 `007`
- `relation "xxx" already exists`
  - 该迁移已执行，跳过即可

## 5) 推荐发布顺序（固定化）

每次涉及 route upload 的发布，统一按下面顺序执行：

1. `npm run migrate:route-upload`（若有 schema 变更）
2. `npm run deploy:route-ingest`
3. 手工上传回归验证

