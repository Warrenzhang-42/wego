-- ============================================================
-- Migration 009: route_versions RLS（非 service_role 场景）
-- WeGO · 须在 008_admin_route_editor.sql 之后执行
--
-- 策略说明：
--   - service_role：始终绕过 RLS，管理端 admin-api.js 行为不变
--   - anon：默认无任何 route_versions 策略 → 不能读/写发布快照（避免 JSON 泄露）
--   - authenticated：可 SELECT / INSERT，便于未来改为「登录编辑者 + JWT」直连 Supabase
--   后续若引入编辑者角色，可改为 WITH CHECK (auth.uid() = …) 等更严条件
-- ============================================================

DO $migration$
BEGIN
  IF to_regclass('public.route_versions') IS NULL THEN
    RAISE NOTICE '009_route_versions_rls: 跳过（请先执行 008_admin_route_editor.sql）';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "route_versions_select" ON route_versions;
  DROP POLICY IF EXISTS "route_versions_select_authenticated" ON route_versions;
  DROP POLICY IF EXISTS "route_versions_insert_authenticated" ON route_versions;

  CREATE POLICY "route_versions_select_authenticated"
    ON route_versions FOR SELECT
    TO authenticated
    USING (true);

  CREATE POLICY "route_versions_insert_authenticated"
    ON route_versions FOR INSERT
    TO authenticated
    WITH CHECK (true);
END;
$migration$;

COMMENT ON TABLE route_versions IS '路线发布快照；RLS：仅 authenticated 可读可写，anon 无权限，service_role 绕过';
