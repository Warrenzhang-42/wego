-- ============================================================
-- Migration 004: 用户数据表
-- WeGO · Sprint 2.5
-- 依赖: 001_routes.sql, 002_spots.sql 已执行
-- ============================================================

-- 用户打卡记录
CREATE TABLE IF NOT EXISTS user_checkins (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_id     UUID        NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  user_id     TEXT,                          -- 预留字段，MVP 阶段可存匿名 ID
  lat         NUMERIC(10, 7) NOT NULL,
  lng         NUMERIC(10, 7) NOT NULL,
  photos      TEXT[]      DEFAULT '{}',
  ai_summary  TEXT,                          -- Agent 生成的打卡一句话总结
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkins_spot_id ON user_checkins(spot_id);
CREATE INDEX IF NOT EXISTS idx_checkins_user_id ON user_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_checkins_created ON user_checkins(created_at DESC);

-- RLS: 打卡记录 MVP 阶段公开可读（后期改为按 user_id 过滤）
ALTER TABLE user_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checkins_public_read"  ON user_checkins FOR SELECT USING (true);
CREATE POLICY "checkins_public_insert" ON user_checkins FOR INSERT WITH CHECK (true);

COMMENT ON TABLE user_checkins IS '用户打卡记录，对应 Contract 4 中的 checkin 对象';

-- -------------------------------------------------------

-- Agent 对话历史
CREATE TABLE IF NOT EXISTS agent_transcripts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   TEXT        NOT NULL,         -- 一次旅程对应一个 session_id
  role         TEXT        NOT NULL CHECK (role IN ('user', 'ai', 'system')),
  content      TEXT        NOT NULL,
  trigger_type TEXT        CHECK (trigger_type IN ('user_input', 'geofence', 'proactive')),
  spot_id      UUID        REFERENCES spots(id) ON DELETE SET NULL,
  inserts      JSONB       DEFAULT '[]',     -- 附加知识卡片/嵌入内容，对应 Contract 2 inserts 字段
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcripts_session ON agent_transcripts(session_id, created_at ASC);

-- RLS: 对话历史按 session 隔离（MVP 阶段公开）
ALTER TABLE agent_transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transcripts_public_read"   ON agent_transcripts FOR SELECT USING (true);
CREATE POLICY "transcripts_public_insert" ON agent_transcripts FOR INSERT WITH CHECK (true);

COMMENT ON TABLE agent_transcripts IS 'Agent 对话历史，对应 Contract 2 中的 chat-message 对象';
