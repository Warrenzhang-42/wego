-- ============================================================
-- Migration 008: 后台手工编辑 — 可见性、游玩点类型、版本快照、移除 difficulty
-- WeGO · 依赖 001_routes, 002_spots
-- 执行方式: Supabase Dashboard > SQL Editor
-- ============================================================

-- routes: 可见性、缩略图、发布版本、草稿时间；移除 difficulty
ALTER TABLE routes DROP COLUMN IF EXISTS difficulty;

ALTER TABLE routes ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS thumbnail_image TEXT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS published_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS last_published_at TIMESTAMPTZ;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS draft_saved_at TIMESTAMPTZ;

COMMENT ON COLUMN routes.is_visible IS '路线是否对前台用户可见';
COMMENT ON COLUMN routes.thumbnail_image IS '路线形状缩略图 URL 或 data URL';
COMMENT ON COLUMN routes.published_version IS '已发布版本号，每次发布 +1';
COMMENT ON COLUMN routes.last_published_at IS '最近一次发布时间';
COMMENT ON COLUMN routes.draft_saved_at IS '管理端最近一次草稿保存时间';

-- spots: 图文、可见、彩蛋、类型
ALTER TABLE spots ADD COLUMN IF NOT EXISTS rich_content TEXT;
ALTER TABLE spots ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE spots ADD COLUMN IF NOT EXISTS is_easter_egg BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE spots ADD COLUMN IF NOT EXISTS spot_type TEXT NOT NULL DEFAULT 'attraction'
  CHECK (spot_type IN ('attraction', 'shop', 'photo_spot', 'knowledge'));

COMMENT ON COLUMN spots.rich_content IS '图文主体，与 spot_type 配合前台模板';
COMMENT ON COLUMN spots.is_visible IS 'false 时不参与路径/距离/时长计算';
COMMENT ON COLUMN spots.is_easter_egg IS 'true 时默认不参与列表、地图与路径计算';
COMMENT ON COLUMN spots.spot_type IS 'attraction|shop|photo_spot|knowledge';

-- 发布版本快照（契约形状 JSON）
CREATE TABLE IF NOT EXISTS route_versions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id        UUID        NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  version_number  INTEGER     NOT NULL,
  snapshot        JSONB       NOT NULL,
  published_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (route_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_route_versions_route_id ON route_versions(route_id);

ALTER TABLE route_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "route_versions_select" ON route_versions FOR SELECT USING (true);

COMMENT ON TABLE route_versions IS '路线发布快照；version_number 与 routes.published_version 对齐；RLS 收紧见 009_route_versions_rls.sql';
