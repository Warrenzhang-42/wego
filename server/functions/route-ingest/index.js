/**
 * WeGO · route-ingest/index.js
 * Sprint 11.5.1
 *
 * Supabase Edge Function — 路线上传入口 API
 *
 * 端点：
 *   POST /functions/v1/route-ingest
 *     Body: { session_id, file_content, file_type, source_url? }
 *     作用：接收上传请求 → 调用 Agent Python Server → 返回解析状态 + Gap 列表
 *     → 写入 route_drafts 表
 *
 *   GET /functions/v1/route-ingest/:session_id
 *     作用：查询会话状态
 *
 *   POST /functions/v1/route-ingest/:session_id/confirm
 *     Body: { confirmed, overrides? }
 *     作用：确认写入，执行 upsert 后更新草稿状态
 *
 * 环境变量：
 *   - SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY（由 Supabase 自动注入）
 *   - AGENT_BASE_URL（Python Agent Server 地址，默认 http://localhost:8000）
 */

'use strict';

/** 与 Supabase 文档一致，避免遗漏浏览器/SDK 使用的请求头导致预检失败 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/* ============================================================
   契约校验
   ============================================================ */
function validateUploadRequest(body) {
  const errors = [];
  if (!body.session_id) errors.push('session_id 为必填');
  if (!body.file_content) errors.push('file_content 为必填');
  if (!['json', 'markdown', 'txt', 'url'].includes(body.file_type)) {
    errors.push('file_type 必须为 json | markdown | txt | url');
  }
  return errors;
}

/* ============================================================
   Supabase REST 辅助
   ============================================================ */
async function supabaseFetch(path, { method = 'GET', body, params, headers: extraHeaders } = {}) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_KEY');
  const url = new URL(`${supabaseUrl}/rest/v1/${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const opts = {
    method,
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...extraHeaders,
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url.toString(), opts);
  return res;
}

/* ============================================================
   调用 Python Agent Server
   ============================================================ */
async function callAgentTool(toolName, payload) {
  const agentBaseUrl = Deno.env.get('AGENT_BASE_URL') || 'http://localhost:8000';
  const res = await fetch(`${agentBaseUrl}/${toolName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Agent ${toolName} 失败 (${res.status}): ${text}`);
  }
  return res.json();
}

/* ============================================================
   路由分发
   ============================================================ */
const _PATH_RE = /^\/([a-f0-9-]{36})(?:\/confirm)?$/i;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // CORS 预检（须 2xx + 完整 Allow-Headers；网关 verify_jwt 见 supabase/config.toml）
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  /* ── GET /functions/v1/route-ingest/:session_id ── */
  const getMatch = pathname.match(/^\/([a-f0-9-]{36})$/i);
  if (req.method === 'GET' && getMatch) {
    const sessionId = getMatch[1];
    try {
      const res = await supabaseFetch('route_drafts', {
        params: { 'session_id': `eq.${sessionId}`, select: 'status,parsed_data,gap_items,created_at' },
      });
      if (!res.ok) throw new Error(`Supabase read failed: ${res.status}`);
      const rows = await res.json();
      if (!rows || rows.length === 0) {
        return jsonResp({ error: 'Session not found' }, 404);
      }
      return jsonResp(rows[0]);
    } catch (err) {
      return jsonResp({ error: err.message }, 500);
    }
  }

  /* ── POST /functions/v1/route-ingest/:session_id/confirm ── */
  const confirmMatch = pathname.match(/^\/([a-f0-9-]{36})\/confirm$/i);
  if (req.method === 'POST' && confirmMatch) {
    const sessionId = confirmMatch[1];
    let body;
    try { body = await req.json(); } catch {
      return jsonResp({ error: 'Invalid JSON body' }, 400);
    }
    const { confirmed = false, overrides = [] } = body;
    try {
      // 1. 读取草稿
      const draftRes = await supabaseFetch('route_drafts', {
        params: { 'session_id': `eq.${sessionId}`, select: '*' },
      });
      if (!draftRes.ok) throw new Error(`Draft fetch failed: ${draftRes.status}`);
      const drafts = await draftRes.json();
      const draft = drafts?.[0];
      if (!draft) return jsonResp({ error: 'Session not found' }, 404);

      // 2. 调用 Agent confirm 工具
      const agentResult = await callAgentTool('route-upload/confirm', {
        session_id: sessionId,
        confirmed,
        overrides,
      });

      // 3. 更新草稿状态
      const newStatus = confirmed ? 'confirmed' : 'skipped';
      await supabaseFetch('route_drafts', {
        method: 'PATCH',
        params: { 'session_id': `eq.${sessionId}` },
        body: {
          status: newStatus,
          user_overrides: overrides,
        },
      });

      return jsonResp({
        session_id: sessionId,
        ...agentResult,
      });
    } catch (err) {
      return jsonResp({ error: err.message }, 500);
    }
  }

  /* ── POST /functions/v1/route-ingest（主入口：上传 + 解析）── */
  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch {
      return jsonResp({ error: 'Invalid JSON body' }, 400);
    }

    const errors = validateUploadRequest(body);
    if (errors.length) return jsonResp({ error: errors.join('; ') }, 400);

    const { session_id, file_content, file_type, source_url } = body;

    try {
      // 1. 写入 route_drafts（pending_review 状态）
      const insertRes = await supabaseFetch('route_drafts', {
        method: 'POST',
        body: {
          session_id,
          source_file: source_url || null,
          file_type,
          raw_content: file_content,
          status: 'pending_review',
          gap_items: [],
        },
      });
      if (!insertRes.ok) {
        const txt = await insertRes.text();
        // 草稿可能已存在（幂等），忽略 duplicate 错误
        if (!txt.includes('duplicate') && !txt.includes('23505')) {
          throw new Error(`Draft insert failed: ${insertRes.status} ${txt}`);
        }
      }

      // 2. 调用 Python Agent Server 解析
      let agentResult;
      try {
        agentResult = await callAgentTool('route-upload', {
          file_content,
          file_type,
          session_id,
        });
      } catch (agentErr) {
        // Agent 离线时返回 Mock 结果，保持流程可继续
        console.warn('[route-ingest] Agent 离线，使用 Mock 响应:', agentErr.message);
        agentResult = buildMockResult(session_id, file_content, file_type);
      }

      const { status, route_preview, gaps, error } = agentResult;

      // 3. 更新草稿
      const newStatus = (status === 'has_gaps') ? 'gaps_filling'
        : (status === 'success') ? 'ready_to_confirm'
        : 'failed';

      await supabaseFetch('route_drafts', {
        method: 'PATCH',
        params: { 'session_id': `eq.${session_id}` },
        body: {
          parsed_data: route_preview || null,
          gap_items: gaps || [],
          status: newStatus,
        },
      });

      return jsonResp({
        session_id,
        status,
        route_preview,
        gaps: gaps || [],
        error: error || null,
      });

    } catch (err) {
      console.error('[route-ingest] 处理失败:', err);
      // 出错后更新草稿状态
      try {
        await supabaseFetch('route_drafts', {
          method: 'PATCH',
          params: { 'session_id': `eq.${session_id}` },
          body: { status: 'failed' },
        });
      } catch { /* ignore */ }
      return jsonResp({ error: err.message }, 500);
    }
  }

  /* ── 不支持的路由 ── */
  return jsonResp({ error: 'Method Not Allowed' }, 405);
});

/* ============================================================
   辅助
   ============================================================ */
function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

/**
 * Mock 解析结果（Agent 离线时的降级处理）
 * 仅用于本地开发/测试，生产环境应确保 Agent 在线。
 */
function buildMockResult(sessionId, fileContent, fileType) {
  const spots = [];
  let nameCount = 1;

  if (fileType === 'json') {
    try {
      const parsed = JSON.parse(fileContent);
      const spotsRaw = parsed.spots || parsed.route?.spots || [];
      spotsRaw.forEach(s => {
        if (s.name) {
          spots.push({
            name: s.name,
            lat: s.lat || null,
            lng: s.lng || null,
            estimated_stay_min: s.estimated_stay_min || null,
            sort_order: s.sort_order || spots.length,
          });
        }
      });
    } catch { /* ignore */ }
  } else {
    // Markdown / TXT：每行一个景点名
    fileContent.split('\n').forEach(line => {
      const name = line.replace(/^[-*#\d.、]+/, '').trim();
      if (name && name.length > 1) {
        spots.push({ name, lat: null, lng: null, estimated_stay_min: null, sort_order: spots.length });
      }
    });
  }

  const gaps = spots
    .flatMap((sp, idx) => {
      const list = [];
      if (sp.lat === null || sp.lng === null) {
        list.push({ field: `${idx}:lat`, gap_type: 'subjective', message: `请提供「${sp.name}」的经纬度坐标` });
      }
      if (sp.estimated_stay_min === null) {
        list.push({ field: `${idx}:estimated_stay_min`, gap_type: 'subjective', message: `「${sp.name}」建议停留多长时间？` });
      }
      return list;
    });

  return {
    session_id: sessionId,
    status: gaps.length ? 'has_gaps' : 'success',
    route_preview: {
      route_name: '未命名路线',
      spots,
    },
    gaps,
    error: null,
  };
}
