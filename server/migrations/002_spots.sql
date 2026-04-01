-- ============================================================
-- Migration 002: spots 表
-- WeGO · Sprint 2.3
-- 依赖: 001_routes.sql 已执行
-- ============================================================

CREATE TABLE IF NOT EXISTS spots (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id           UUID        NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  name               TEXT        NOT NULL,
  subtitle           TEXT,
  short_desc         TEXT,
  detail             TEXT,
  tags               TEXT[]      DEFAULT '{}',
  thumb              TEXT,
  photos             TEXT[]      DEFAULT '{}',
  lat                NUMERIC(10, 7) NOT NULL,
  lng                NUMERIC(10, 7) NOT NULL,
  geofence_radius_m  INTEGER     DEFAULT 30,
  estimated_stay_min INTEGER,
  sort_order         INTEGER     NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- 更新时间触发器
CREATE TRIGGER spots_updated_at
  BEFORE UPDATE ON spots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 索引：按路线查景点（最高频查询）
CREATE INDEX IF NOT EXISTS idx_spots_route_id ON spots(route_id);
-- 索引：按路线 + 顺序查景点
CREATE INDEX IF NOT EXISTS idx_spots_route_sort ON spots(route_id, sort_order);

-- RLS: 景点为公开读取
ALTER TABLE spots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spots_public_read" ON spots FOR SELECT USING (true);

COMMENT ON TABLE spots IS 'WeGO 景点表，对应 Contract 1 中的 spot 对象';
COMMENT ON COLUMN spots.geofence_radius_m IS '触发围栏的半径（米），默认 30m';
COMMENT ON COLUMN spots.sort_order IS '在路线中的顺序，从 1 开始';
