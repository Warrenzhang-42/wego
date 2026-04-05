-- ============================================================
-- Migration 013: 地区轮播「城市组合」— 多城共享一套 items，仍按 city:adcode 存配置行
-- WeGO · 管理端组合表仅记录归属；前台解析逻辑不变
-- 执行方式: Supabase Dashboard > SQL Editor 粘贴运行
-- ============================================================

CREATE TABLE IF NOT EXISTS home_carousel_city_groups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE home_carousel_city_groups IS '地区轮播组合：多城共用一套轮播内容（写入时同步到各 city: 行）';

CREATE TABLE IF NOT EXISTS home_carousel_city_group_members (
  group_id    UUID        NOT NULL REFERENCES home_carousel_city_groups(id) ON DELETE CASCADE,
  city_adcode TEXT        NOT NULL,
  PRIMARY KEY (group_id, city_adcode)
);

COMMENT ON TABLE home_carousel_city_group_members IS '组合成员；每个城市全局最多只属于一个组合';

CREATE UNIQUE INDEX IF NOT EXISTS home_carousel_city_group_members_city_unique
  ON home_carousel_city_group_members(city_adcode);

CREATE INDEX IF NOT EXISTS home_carousel_city_group_members_group_idx
  ON home_carousel_city_group_members(group_id);

ALTER TABLE home_carousel_city_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_carousel_city_group_members ENABLE ROW LEVEL SECURITY;
