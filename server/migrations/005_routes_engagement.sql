-- ============================================================
-- Migration 005: routes 列表展示扩展字段（热度、首页分类）
-- WeGO · 与北京精选路线种子数据配套
-- 依赖: 001_routes.sql 已执行
-- 执行方式: Supabase Dashboard > SQL Editor 粘贴运行
-- ============================================================

ALTER TABLE routes ADD COLUMN IF NOT EXISTS heat_level INTEGER DEFAULT 3;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS heat_count INTEGER DEFAULT 0;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS category TEXT;

COMMENT ON COLUMN routes.heat_level IS '热度点数 0–5，对应列表卡片圆点';
COMMENT ON COLUMN routes.heat_count IS '热度累计值，前端格式化为如 24.8k';
COMMENT ON COLUMN routes.category IS '首页 Chip：本地、推荐、美食、文化、自然（与业务筛选对齐）';
