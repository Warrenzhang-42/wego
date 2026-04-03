-- ============================================================
-- Migration 007: route_drafts 表（草稿会话）
-- WeGO · Sprint 11.2.1
-- 用途：存储用户上传路线文件后的解析中间状态，含 Gap 列表
-- 执行方式：在 Supabase Dashboard > SQL Editor 中粘贴并运行
-- ============================================================

CREATE TABLE IF NOT EXISTS route_drafts (
  -- 核心标识
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 来源追溯
  session_id      UUID        NOT NULL UNIQUE,
  -- route_ingestion_jobs.id（可选关联，用于审计链路）
  ingestion_job_id UUID        REFERENCES route_ingestion_jobs(id) ON DELETE SET NULL,

  -- 文件原始信息
  source_file     TEXT,                          -- 原始文件名或 URL
  file_type       TEXT        NOT NULL CHECK (file_type IN ('json','markdown','txt','url')),
  raw_content     TEXT        NOT NULL,           -- 原始文本内容（URL 时存 URL）

  -- Agent 解析结果
  parsed_data     JSONB,                          -- Agent 解析后的结构化数据（中间态）
  status          TEXT        NOT NULL DEFAULT 'pending_review'
                                CHECK (status IN (
                                  'pending_review',  -- 解析完成，等待用户补充 Gap
                                  'gaps_filling',   -- 用户正在补充主观 Gap
                                  'ready_to_confirm',-- 所有 Gap 已处理完毕，可确认写入
                                  'confirmed',      -- 用户已确认，异步写入中
                                  'failed'          -- 解析失败
                                )),
  gap_items       JSONB       DEFAULT '[]',       -- Gap 列表，含 gap_type / field / message / auto_queried / suggested_value / user_override
  user_overrides  JSONB       DEFAULT '[]',       -- 用户对主观 Gap 的回答汇总

  -- 审核与写入（由 confirm 流程写入）
  confirmed_data  JSONB,                          -- 最终确认的完整路线 JSON（写入前快照）
  confirmed_at     TIMESTAMPTZ,

  -- 时间戳
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_route_drafts_session_id   ON route_drafts(session_id);
CREATE INDEX idx_route_drafts_status       ON route_drafts(status);
CREATE INDEX idx_route_drafts_ingestion_job ON route_drafts(ingestion_job_id) WHERE ingestion_job_id IS NOT NULL;

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_route_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER route_drafts_updated_at
  BEFORE UPDATE ON route_drafts
  FOR EACH ROW EXECUTE FUNCTION update_route_drafts_updated_at();

-- RLS：仅 Agent Service Role 可写入，SELECT 开放给所有已认证用户（可选）
ALTER TABLE route_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "route_drafts_read_auth"  ON route_drafts FOR SELECT USING (true);
CREATE POLICY "route_drafts_insert"     ON route_drafts FOR INSERT WITH CHECK (true);
CREATE POLICY "route_drafts_update"     ON route_drafts FOR UPDATE USING (true);

-- 注释
COMMENT ON TABLE route_drafts IS '路线上传草稿表，记录上传→解析→Gap填写→确认的完整状态链路（Sprint 11）';
COMMENT ON COLUMN route_drafts.gap_items IS 'Gap 列表数组，每项含 gap_type(objective/subjective)、field、message、auto_queried、suggested_value、user_override';
COMMENT ON COLUMN route_drafts.user_overrides IS '用户对主观 Gap 的回答数组，按 field 索引';
