-- ============================================================
-- Migration 014: 前台可读的全局运行时配置（非敏感项）
-- WeGO · 地图引擎等由后台配置，默认高德 amap
-- 执行方式: Supabase Dashboard > SQL Editor 粘贴运行
-- ============================================================

CREATE TABLE IF NOT EXISTS app_public_settings (
  setting_key   TEXT        PRIMARY KEY,
  setting_value TEXT        NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE app_public_settings IS '前台匿名可读的配置键值；不得存放密钥。map_engine: amap | mapbox | bmap';
COMMENT ON COLUMN app_public_settings.setting_key IS '例如 map_engine';
COMMENT ON COLUMN app_public_settings.setting_value IS '须符合 contracts/map-engine-setting.schema.json';

DROP TRIGGER IF EXISTS app_public_settings_updated_at ON app_public_settings;
CREATE TRIGGER app_public_settings_updated_at
  BEFORE UPDATE ON app_public_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE app_public_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_public_settings_read" ON app_public_settings;
CREATE POLICY "app_public_settings_read"
  ON app_public_settings FOR SELECT
  USING (true);

-- 默认高德；后台修改示例:
-- UPDATE app_public_settings SET setting_value = 'mapbox' WHERE setting_key = 'map_engine';
INSERT INTO app_public_settings (setting_key, setting_value)
VALUES ('map_engine', 'amap')
ON CONFLICT (setting_key) DO NOTHING;
