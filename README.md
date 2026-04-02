## 新路线上线标准操作流程 (SOP)

当需要发布新路线数据时，请遵循以下标准操作流程：

### 1. Dry Run（空运行）
```bash
# 解析 Markdown 文件
node data/scripts/parse-route-md.js data/knowledge/<路线名>/<路线名>.md > route-candidate.json

# 验证 JSON
node data/scripts/validate-route-json.js route-candidate.json validation-report.json

# 清洗 JSON
node data/scripts/clean-route-json.js route-candidate.json cleaning-report.json

# 空运行导入（不实际写入数据库）
node data/scripts/seed-route-candidate.js route-candidate.json --dry-run --output-report=dry-run-report.json
```

### 2. Review（审核）
1. **检查报告**：
   - 验证报告 (`validation-report.json`)
   - 清洗报告 (`cleaning-report.json`)
   - 空运行报告 (`dry-run-report.json`)
2. **验证数据**：
   - 确保所有字段符合预期
   - 检查坐标是否在合理范围内
   - 确认景点排序正确
3. **团队审核**：
   - 至少一名团队成员审核数据
   - 记录审核结果

### 3. Publish（发布）
```bash
# 实际导入数据库
node data/scripts/seed-route-candidate.js route-candidate.json --output-report=production-report.json
```

### 4. Verify（验证）
1. **数据库验证**：
   ```sql
   SELECT * FROM routes WHERE id = '<新路线ID>';
   SELECT * FROM spots WHERE route_id = '<新路线ID>';
   ```
2. **应用验证**：
   - 在应用中检查新路线是否显示
   - 验证路线详情页是否正确加载
   - 测试景点打卡功能
3. **API 验证**：
   - 测试知识检索 API 是否返回新路线相关内容
   - 验证 AI 讲解是否包含新景点信息

### 5. Rollback（回滚）
如果发布后发现问题，执行以下回滚步骤：
```bash
# 回滚路线和景点数据
node data/scripts/rollback-route.js <新路线ID>
```

回滚脚本 (`data/scripts/rollback-route.js`) 将：
1. 删除指定路线的所有景点
2. 删除路线本身
3. 保留审计记录供后续分析

### 审计记录
所有操作都会记录在 `route_ingestion_jobs` 表中，包含：
- 操作类型（dry run, publish, rollback）
- 执行时间
- 操作状态（成功/失败）
- 详细报告链接

### 最佳实践
1. **低峰时段发布**：选择用户活跃度低的时间段（如凌晨）
2. **分批次发布**：一次发布不超过 5 条新路线
3. **监控**：发布后监控系统日志和错误率
4. **备份**：发布前备份相关表（`routes`, `spots`）