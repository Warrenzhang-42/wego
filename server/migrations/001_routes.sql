-- ============================================================
-- Migration 001: routes 表
-- WeGO · Sprint 2.2
-- 执行方式: 在 Supabase Dashboard > SQL Editor 中粘贴并运行
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS routes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT        NOT NULL,
  description       TEXT,
  duration_minutes  INTEGER,
  difficulty        TEXT        CHECK (difficulty IN ('easy', 'medium', 'hard')),
  tags              TEXT[]      DEFAULT '{}',
  cover_image       TEXT,
  total_distance_km NUMERIC(6, 3),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 更新时间自动触发器
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER routes_updated_at
  BEFORE UPDATE ON routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: 路线为公开读取
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routes_public_read" ON routes FOR SELECT USING (true);

COMMENT ON TABLE routes IS 'WeGO 路线主表，对应 Contract 1 中的 route 对象';
