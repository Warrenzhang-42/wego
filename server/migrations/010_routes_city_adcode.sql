-- WeGO · 路线所在城市（国标行政区划代码，用于管理端坐标范围校验）
-- 依赖: 001_routes.sql

ALTER TABLE routes ADD COLUMN IF NOT EXISTS city_adcode TEXT;

COMMENT ON COLUMN routes.city_adcode IS '所在城市：6 位国标区划代码（地级市/直辖市），WGS-84 景点坐标需在对应城市粗略边界内；与 contracts/route.schema.json 中 city_adcode 一致';
