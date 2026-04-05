-- ============================================================
-- Migration 011: 首页轮播配置（通用 / 按城市覆盖）
-- WeGO · 管理后台可配置；前台按当前城市解析
-- 执行方式: Supabase Dashboard > SQL Editor 粘贴运行
-- ============================================================

-- 与 001_routes.sql 一致；若项目已执行过 001，此处为幂等替换
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS home_carousel_configs (
  config_key  TEXT        PRIMARY KEY,
  items       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE home_carousel_configs IS '首页轮播：config_key=general 为全站通用；city:六位 adcode 为城市覆盖（存在则不再使用 general）';
COMMENT ON COLUMN home_carousel_configs.config_key IS 'general 或 city:110000 等形式';
COMMENT ON COLUMN home_carousel_configs.items IS '符合 contracts/home-carousel.schema.json 的 slides 数组';

DROP TRIGGER IF EXISTS home_carousel_configs_updated_at ON home_carousel_configs;
CREATE TRIGGER home_carousel_configs_updated_at
  BEFORE UPDATE ON home_carousel_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE home_carousel_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "home_carousel_public_read" ON home_carousel_configs;
CREATE POLICY "home_carousel_public_read"
  ON home_carousel_configs FOR SELECT
  USING (true);

-- 写入仅 service_role（anon 无 INSERT/UPDATE/DELETE 策略即拒绝）
