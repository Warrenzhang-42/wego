-- ============================================================
-- Migration 003: knowledge_embeddings 表
-- WeGO · Sprint 2.4
-- 依赖:
--   001_routes.sql 已执行（routes 表）
--   002_spots.sql  已执行（spots 表）
--   Supabase 已启用 pgvector 扩展（Dashboard > Database > Extensions > vector）
--   Supabase 已启用 postgis 扩展（Dashboard > Database > Extensions > postgis）
-- 执行方式: Supabase Dashboard > SQL Editor 中粘贴并运行
-- ============================================================

-- 启用必要扩展（Supabase 上通常已预装，幂等操作不会报错）
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- 支持 GIN 全文模糊检索

-- ============================================================
-- 知识库切片表
-- 每条记录代表一个知识切片（chunk），含原文、向量、空间位置与元数据
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_embeddings (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 关联
  spot_id      UUID          REFERENCES spots(id) ON DELETE SET NULL,   -- 可关联到具体景点，也可为 NULL（路线级知识）
  route_id     UUID          REFERENCES routes(id) ON DELETE CASCADE,   -- 必须关联到路线

  -- 知识内容
  chunk_text   TEXT          NOT NULL,                                   -- 切片原文（300-500 token）
  chunk_type   TEXT          CHECK (chunk_type IN (
                               'history',      -- 历史背景
                               'culture',      -- 文化习俗
                               'practical',    -- 实用信息（营业时间/价格/交通）
                               'story',        -- 故事传说
                               'food',         -- 美食介绍
                               'art'           -- 艺术工艺
                             )) DEFAULT 'culture',
  source       TEXT,                                                     -- 来源标识（文件名或 URL）
  metadata     JSONB         DEFAULT '{}',                               -- 扩展元数据（标题、章节等）

  -- 向量检索（OpenAI text-embedding-3-small → 1536 维）
  embedding    VECTOR(1536),

  -- 全文检索（自动维护，无需手动更新）
  fts          TSVECTOR GENERATED ALWAYS AS (
                 to_tsvector('simple', coalesce(chunk_text, ''))
               ) STORED,

  -- 空间位置（可选，关联景点的坐标，用于地理邻近检索）
  geom         GEOMETRY(POINT, 4326),

  created_at   TIMESTAMPTZ   DEFAULT NOW()
);

-- ============================================================
-- 索引
-- ============================================================

-- 1. HNSW 向量索引（近似最近邻，余弦相似度）
--    参数说明：m=16（每层连接数），ef_construction=64（构建精度）
--    适合 < 100 万条数据的场景，查询 QPS 高
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding_hnsw
  ON knowledge_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 2. GIN 全文检索索引
CREATE INDEX IF NOT EXISTS idx_knowledge_fts_gin
  ON knowledge_embeddings
  USING gin (fts);

-- 3. PostGIS 空间索引（GIST）
CREATE INDEX IF NOT EXISTS idx_knowledge_geom_gist
  ON knowledge_embeddings
  USING gist (geom);

-- 4. 按路线过滤的常规索引
CREATE INDEX IF NOT EXISTS idx_knowledge_route_id
  ON knowledge_embeddings(route_id);

-- 5. 按景点过滤的常规索引
CREATE INDEX IF NOT EXISTS idx_knowledge_spot_id
  ON knowledge_embeddings(spot_id)
  WHERE spot_id IS NOT NULL;

-- ============================================================
-- RLS：知识库为公开只读（写入需要 Service Role Key）
-- ============================================================
ALTER TABLE knowledge_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_public_read"
  ON knowledge_embeddings
  FOR SELECT
  USING (true);

-- ============================================================
-- 三重混合检索函数（向量 + 全文 + 空间）
-- 供 Sprint 3.5 的 Edge Function 调用
-- 参数:
--   query_embedding  VECTOR(1536)  — 查询向量
--   query_text       TEXT          — 查询文本（用于全文检索）
--   query_lat        FLOAT8        — 用户当前纬度（可选）
--   query_lng        FLOAT8        — 用户当前经度（可选）
--   radius_m         FLOAT8        — 空间过滤半径（米，0 表示不过滤）
--   match_count      INT           — 返回结果数量
-- ============================================================
CREATE OR REPLACE FUNCTION search_knowledge(
  query_embedding  VECTOR(1536),
  query_text       TEXT,
  query_lat        FLOAT8  DEFAULT NULL,
  query_lng        FLOAT8  DEFAULT NULL,
  radius_m         FLOAT8  DEFAULT 500,
  match_count      INT     DEFAULT 5
)
RETURNS TABLE (
  id          UUID,
  spot_id     UUID,
  chunk_text  TEXT,
  chunk_type  TEXT,
  metadata    JSONB,
  similarity  FLOAT8,
  distance_m  FLOAT8
)
LANGUAGE plpgsql
AS $$
DECLARE
  user_geom GEOMETRY;
BEGIN
  -- 构建用户位置（若提供经纬度）
  IF query_lat IS NOT NULL AND query_lng IS NOT NULL THEN
    user_geom := ST_SetSRID(ST_MakePoint(query_lng, query_lat), 4326);
  END IF;

  RETURN QUERY
  SELECT
    ke.id,
    ke.spot_id,
    ke.chunk_text,
    ke.chunk_type,
    ke.metadata,
    -- 向量相似度（余弦距离转相似度）
    (1 - (ke.embedding <=> query_embedding))::FLOAT8                  AS similarity,
    -- 空间距离（米，若无位置则返回 NULL）
    CASE
      WHEN user_geom IS NOT NULL AND ke.geom IS NOT NULL
      THEN ST_Distance(ST_Transform(ke.geom, 3857), ST_Transform(user_geom, 3857))
      ELSE NULL
    END::FLOAT8                                                       AS distance_m
  FROM knowledge_embeddings ke
  WHERE
    -- 1. 向量相似度阈值（余弦相似度 > 0.30 才纳入候选，适配不同模型分布）
    (ke.embedding <=> query_embedding) < 0.70
    -- 2. 全文检索（plainto_tsquery 容忍中文分词不完整）
    AND (
      query_text IS NULL
      OR ke.fts @@ plainto_tsquery('simple', query_text)
      OR ke.chunk_text ILIKE '%' || query_text || '%'  -- 关键词硬匹配兜底
    )
    -- 3. 空间过滤（若提供位置且 radius_m > 0）
    AND (
      user_geom IS NULL
      OR radius_m <= 0
      OR ke.geom IS NULL
      OR ST_DWithin(ke.geom::GEOGRAPHY, user_geom::GEOGRAPHY, radius_m)
    )
  ORDER BY
    -- 综合排序：向量距离 0.7权重 + 全文匹配 0.3权重
    (ke.embedding <=> query_embedding) * 0.7
    + CASE
        WHEN ke.fts @@ plainto_tsquery('simple', query_text) THEN 0
        ELSE 0.3
      END
  LIMIT match_count;
END;
$$;

COMMENT ON TABLE knowledge_embeddings IS 'WeGO 知识库切片表，支持向量/全文/空间三重混合检索';
COMMENT ON COLUMN knowledge_embeddings.embedding IS 'OpenAI text-embedding-3-small 生成的 1536 维向量';
COMMENT ON COLUMN knowledge_embeddings.fts IS '自动生成的全文检索向量，使用 simple 分词器兼容中文';
COMMENT ON COLUMN knowledge_embeddings.geom IS 'PostGIS 空间点，对应景点地理位置，用于地理围栏联合检索';
COMMENT ON FUNCTION search_knowledge IS '三重混合检索：向量相似度 + 全文检索 + 空间邻近，返回 Top-N 知识切片';
