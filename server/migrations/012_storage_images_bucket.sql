-- ============================================================
-- Migration 012: Storage bucket `images`（封面 / 景点图 / 轮播）
-- WeGO · admin-api.js 中 uploadCoverImage / uploadSpotImage / uploadCarouselImage 均使用此桶
-- 执行方式: Supabase Dashboard > SQL Editor 粘贴运行
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- 公开读：前台与 getPublicUrl 访问；写入由 service_role 绕过 RLS
DROP POLICY IF EXISTS "images_bucket_public_read" ON storage.objects;
CREATE POLICY "images_bucket_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'images');
