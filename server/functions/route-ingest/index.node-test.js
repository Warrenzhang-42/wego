/**
 * WeGO · route-ingest/index.node-test.js
 * Sprint 11.5.1 — Edge Function 路由级测试（纯 Node.js，无需 Deno）
 *
 * 运行：
 *   node server/functions/route-ingest/index.node-test.js
 *
 * 测试覆盖：
 *   ✓ validateUploadRequest — 合规/缺字段/非法类型
 *   ✓ buildMockResult      — JSON 解析/文本行拆分/缺失坐标 Gap 生成
 *   ✓ POST /  → has_gaps  — 正常流程，mock Agent + Supabase
 *   ✓ POST /  → Agent 离线 → 降级 Mock
 *   ✓ GET  /:session_id   — 找到记录 / Session 不存在 404
 *   ✓ POST /:session_id/confirm — 确认写入 + 状态更新
 *   ✓ POST /:session_id/gap-reply — 转发到 Agent
 *   ✓ OPTIONS → 200 + CORS 头
 *   ✓ POST /  → 非法 file_type → 400
 */

// ── Deno 全局模拟 ──────────────────────────────────────────────
const mockEnv = {
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  AGENT_BASE_URL: "http://localhost:8000",
};

globalThis.Deno = {
  env: { get: (k) => mockEnv[k], set: (k, v) => { mockEnv[k] = v; } },
  serve: undefined,
};

// ── Mock fetch ─────────────────────────────────────────────────
// Separate queues per logical service; route by URL path prefix
const _requests = [];
const _supabaseQueue = [];   // responses for /rest/v1/... (Supabase)
const _agentQueue = [];       // responses for /route-upload, /chat, etc. (Agent)
let _sIdx = 0;
let _aIdx = 0;

globalThis.fetch = async (url, opts = {}) => {
  const raw = String(url);
  _requests.push({ url: raw, method: opts.method || "GET" });
  // Route by path — /rest/v1 → Supabase, everything else (agent server) → agent
  const isSupabase = raw.includes("/rest/v1/");
  const queue = isSupabase ? _supabaseQueue : _agentQueue;
  const idxRef = isSupabase ? "_sIdx" : "_aIdx";
  const idx = isSupabase ? _sIdx++ : _aIdx++;
  if (idx >= queue.length) return { ok: false, status: 500, json: async () => ({}) };
  const r = queue[idx];
  if (r instanceof Error) throw r;
  return r;
};

function resetMocks() {
  _requests.length = 0;
  _supabaseQueue.length = 0;
  _agentQueue.length = 0;
  _sIdx = 0;
  _aIdx = 0;
}

function addResponse(r) { _supabaseQueue.push(r); }
function addAgentResponse(r) { _agentQueue.push(r); }

// ── 纯函数（与 index.js 一致）────────────────────────────────────
function validateUploadRequest(body) {
  const errors = [];
  if (!body.session_id) errors.push("session_id 为必填");
  if (!body.file_content) errors.push("file_content 为必填");
  if (!["json", "markdown", "txt", "url"].includes(body.file_type)) {
    errors.push("file_type 必须为 json | markdown | txt | url");
  }
  return errors;
}

function buildMockResult(sessionId, fileContent, fileType) {
  const spots = [];
  if (fileType === "json") {
    try {
      const parsed = JSON.parse(fileContent);
      (parsed.spots || parsed.route?.spots || []).forEach((s) => {
        if (s.name) {
          spots.push({
            name: s.name,
            lat: s.lat || null,
            lng: s.lng || null,
            estimated_stay_min: s.estimated_stay_min || null,
            sort_order: s.sort_order ?? spots.length,
          });
        }
      });
    } catch (_) {}
  } else {
    fileContent.split("\n").forEach((line) => {
      const name = line.replace(/^[-*#\d.、]+/, "").trim();
      if (name && name.length > 1) {
        spots.push({ name, lat: null, lng: null, estimated_stay_min: null, sort_order: spots.length });
      }
    });
  }
  const gaps = spots.flatMap((sp, idx) => {
    const list = [];
    if (sp.lat === null || sp.lng === null) {
      list.push({ field: `${idx}:lat`, gap_type: "subjective", message: `请提供「${sp.name}」的经纬度坐标` });
    }
    if (sp.estimated_stay_min === null) {
      list.push({ field: `${idx}:estimated_stay_min`, gap_type: "subjective", message: `「${sp.name}」建议停留多长时间？` });
    }
    return list;
  });
  return { session_id: sessionId, status: gaps.length ? "has_gaps" : "success", route_preview: { route_name: "未命名路线", spots }, gaps, error: null };
}

function jsonResp(data, status = 200) {
  return { status, body: data, headers: new Map([["content-type", "application/json"], ["access-control-allow-origin", "*"]]) };
}

// ── handler（精确复刻 index.js 路由逻辑）────────────────────────────
async function handler(req) {
  if (req.method === "OPTIONS") return jsonResp({ ok: true });

  // Normalize URL: Deno passes full URL; Node test mock passes path only
  const fullUrlStr = req.url.startsWith("http") ? req.url : `http://localhost${req.url}`;
  const url = new URL(fullUrlStr);
  const pathname = url.pathname;

  // gap-reply — must come before GET, otherwise /{uuid} would match first
  const gapReplyMatch = pathname.match(/\/([a-f0-9-]{36})\/gap-reply$/i);
  if (req.method === "POST" && gapReplyMatch) {
    const sessionId = gapReplyMatch[1];
    let body;
    try { body = await req.json(); } catch { return jsonResp({ error: "Invalid JSON body" }, 400); }
    const overrides = Array.isArray(body.overrides) ? body.overrides : [];
    try {
      const result = await callAgentTool("route-upload/gap-reply", { session_id: sessionId, overrides });
      return jsonResp(result);
    } catch (err) { return jsonResp({ error: err.message }, 500); }
  }

  // GET status
  const getMatch = pathname.match(/\/([a-f0-9-]{36})$/i);
  if (req.method === "GET" && getMatch) {
    const sessionId = getMatch[1];
    try {
      const res = await supabaseFetch("route_drafts", {
        params: { "session_id": `eq.${sessionId}`, select: "status,parsed_data,gap_items,created_at" },
      });
      if (!res.ok) throw new Error(`Supabase read failed: ${res.status}`);
      const rows = await res.json();
      if (!rows || rows.length === 0) return jsonResp({ error: "Session not found" }, 404);
      return jsonResp(rows[0]);
    } catch (err) { return jsonResp({ error: err.message }, 500); }
  }

  // confirm
  const confirmMatch = pathname.match(/\/([a-f0-9-]{36})\/confirm$/i);
  if (req.method === "POST" && confirmMatch) {
    const sessionId = confirmMatch[1];
    let body;
    try { body = await req.json(); } catch { return jsonResp({ error: "Invalid JSON body" }, 400); }
    const { confirmed = false, overrides = [] } = body;
    try {
      const draftRes = await supabaseFetch("route_drafts", {
        params: { "session_id": `eq.${sessionId}`, select: "*" },
      });
      if (!draftRes.ok) throw new Error(`Draft fetch failed: ${draftRes.status}`);
      const drafts = await draftRes.json();
      const draft = drafts?.[0];
      if (!draft) return jsonResp({ error: "Session not found" }, 404);
      const agentResult = await callAgentTool("route-upload/confirm", { session_id: sessionId, confirmed, overrides });
      const newStatus = confirmed ? "confirmed" : "ready_to_confirm";
      await supabaseFetch("route_drafts", {
        method: "PATCH",
        params: { "session_id": `eq.${sessionId}` },
        body: { status: newStatus, user_overrides: overrides },
      });
      return jsonResp({ session_id: sessionId, ...agentResult });
    } catch (err) { return jsonResp({ error: err.message }, 500); }
  }

  // POST main
  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return jsonResp({ error: "Invalid JSON body" }, 400); }
    const errors = validateUploadRequest(body);
    if (errors.length) return jsonResp({ error: errors.join("; ") }, 400);
    const { session_id, file_content, file_type, source_url } = body;
    try {
      await supabaseFetch("route_drafts", {
        method: "POST",
        body: { session_id, source_file: source_url || null, file_type, raw_content: file_content, status: "pending_review", gap_items: [] },
      });
      let agentResult;
      try {
        agentResult = await callAgentTool("route-upload", { file_content, file_type, session_id });
      } catch (_) {
        agentResult = buildMockResult(session_id, file_content, file_type);
      }
      const { status, route_preview, gaps, error } = agentResult;
      const newStatus = status === "has_gaps" ? "gaps_filling" : status === "success" ? "ready_to_confirm" : "failed";
      await supabaseFetch("route_drafts", {
        method: "PATCH",
        params: { "session_id": `eq.${session_id}` },
        body: { parsed_data: route_preview || null, gap_items: gaps || [], status: newStatus },
      });
      return jsonResp({ session_id, status, route_preview, gaps: gaps || [], error: error || null });
    } catch (err) {
      await supabaseFetch("route_drafts", {
        method: "PATCH",
        params: { "session_id": `eq.${session_id}` },
        body: { status: "failed" },
      }).catch(() => {});
      return jsonResp({ error: err.message }, 500);
    }
  }

  return jsonResp({ error: "Method Not Allowed" }, 405);
}

// ── supabaseFetch / callAgentTool ─────────────────────────────────
async function supabaseFetch(path, { method = "GET", body } = {}) {
  const url = new URL(`http://localhost:54321/rest/v1/${path}`);
  const opts = {
    method,
    headers: {
      apikey: mockEnv.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${mockEnv.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url.toString(), opts);
  return res;
}

async function callAgentTool(toolName, payload) {
  const url = `${mockEnv.AGENT_BASE_URL}/${toolName}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Agent ${toolName} 失败 (${res.status})`);
    const data = await res.json();
    return Array.isArray(data) ? (data[0] ?? {}) : data;
  } catch (err) {
    // Re-throw so the handler's try/catch can distinguish offline from other errors
    throw err;
  }
}

// ── 测试框架 ─────────────────────────────────────────────────────
let passed = 0, failed = 0;

async function runTests() {
  // 36-char UUIDs (regex requires exactly 36 chars for the UUID portion)
  const SESSION = "01111111-1111-1111-1111-111111111111";
  const SESSION2 = "02222222-2222-2222-2222-222222222222";
  const SESSION3 = "03333333-3333-3333-3333-333333333333";
  const BASE = "http://localhost:54321/functions/v1/route-ingest";

  function sEq(a, b, msg) {
    if (a !== b) throw new Error(`${msg || "assertEquals"} — 期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`);
  }
  function sT(a, msg) {
    if (!a) throw new Error(msg || `期望 truthy，实际 ${a}`);
  }

  async function test(name, fn) {
    resetMocks();
    try {
      await fn();
      console.log(`  ✅  ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ❌  ${name}`);
      if (e && e.message) console.log(`       ${e.message}`);
      failed++;
    }
  }

  // ── validateUploadRequest ──────────────────────────────────────
  console.log("【 validateUploadRequest 】");
  await test("合法请求返回空错误", async () => {
    sEq(validateUploadRequest({ session_id: SESSION, file_content: "{}", file_type: "json" }).length, 0);
  });
  await test("缺少 session_id", async () => {
    sT(validateUploadRequest({ file_content: "{}", file_type: "json" }).length > 0);
  });
  await test("非法 file_type", async () => {
    sT(validateUploadRequest({ session_id: SESSION, file_content: "x", file_type: "pdf" }).length > 0);
  });

  // ── buildMockResult ─────────────────────────────────────────────
  console.log("\n【 buildMockResult 】");
  await test("JSON 完整景点返回 success", async () => {
    const r = buildMockResult(SESSION, JSON.stringify({ spots: [{ name: "前门", lat: 39.89, lng: 116.39, estimated_stay_min: 30 }] }), "json");
    sEq(r.status, "success");
    sEq(r.route_preview.spots.length, 1);
    sEq(r.gaps.length, 0);
  });
  await test("坐标缺失产生 has_gaps", async () => {
    const r = buildMockResult(SESSION, JSON.stringify({ spots: [{ name: "前门" }] }), "json");
    sEq(r.status, "has_gaps");
    sT(r.gaps.some((g) => g.field === "0:lat"));
  });
  await test("纯文本每行一个景点", async () => {
    const r = buildMockResult(SESSION, "前门\n杨梅竹斜街", "txt");
    sEq(r.route_preview.spots.length, 2);
    sEq(r.status, "has_gaps");
  });

  // ── POST / ───────────────────────────────────────────────────────
  console.log("\n【 POST / 主入口 】");
  await test("POST / → has_gaps 完整流程", async () => {
    addResponse({ ok: true, status: 201, json: async () => [{}] });
    addResponse({ ok: true, status: 200, json: async () => [{}] });
    addAgentResponse({ ok: true, status: 200, json: async () => ({
      status: "has_gaps", session_id: SESSION,
      route_preview: { route_name: "测试", spots: [{ name: "前门" }] },
      gaps: [{ field: "0:lat", gap_type: "subjective", message: "请提供坐标" }],
    })});
    const resp = await handler({
      method: "POST", url: `${BASE}`,
      async json() { return { session_id: SESSION, file_content: "{}", file_type: "json" }; },
    });
    sEq(resp.status, 200);
    sEq(resp.body.status, "has_gaps");
    sEq(resp.body.gaps.length, 1);
    sT(_requests.some((r) => r.url.includes("/rest/v1/route_drafts")));
  });

  await test("POST / → Agent 离线降级 Mock", async () => {
    addResponse({ ok: true, status: 201, json: async () => [{}] });
    addResponse({ ok: true, status: 200, json: async () => [{}] });
    addAgentResponse(new Error("Agent offline"));
    const resp = await handler({
      method: "POST", url: `${BASE}`,
      async json() { return { session_id: SESSION2, file_content: JSON.stringify({ spots: [] }), file_type: "json" }; },
    });
    sEq(resp.status, 200);
    sT(resp.body.status === "has_gaps" || resp.body.status === "success");
  });

  await test("POST / → 非法 file_type 返回 400", async () => {
    const resp = await handler({
      method: "POST", url: `${BASE}`,
      async json() { return { session_id: SESSION, file_content: "x", file_type: "binary" }; },
    });
    sEq(resp.status, 400);
  });

  // ── GET /:session_id ────────────────────────────────────────────
  console.log("\n【 GET /:session_id 】");
  await test("GET → 找到记录", async () => {
    addResponse({ ok: true, status: 200, json: async () => [{
      session_id: SESSION3, status: "gaps_filling", parsed_data: { route_name: "测试" },
      gap_items: [{ field: "0:lat", gap_type: "subjective", message: "请提供" }],
    }]});
    const resp = await handler({ method: "GET", url: `${BASE}/${SESSION3}` });
    sEq(resp.status, 200);
    sEq(resp.body.status, "gaps_filling");
    sEq(resp.body.gap_items.length, 1);
  });

  await test("GET → Session 不存在 404", async () => {
    addResponse({ ok: true, status: 200, json: async () => [] });
    const resp = await handler({ method: "GET", url: `${BASE}/ffffffff-ffff-ffff-ffff-ffffffffffff` });
    sEq(resp.status, 404);
  });

  // ── POST /:session_id/confirm ───────────────────────────────────
  console.log("\n【 POST /:session_id/confirm 】");
  await test("POST confirm → confirmed", async () => {
    addResponse({ ok: true, status: 200, json: async () => [{
      session_id: SESSION3, parsed_data: { route_name: "确认", spots: [] }, user_overrides: [],
    }]});
    addAgentResponse({ ok: true, status: 200, json: async () => ({
      status: "confirmed", session_id: SESSION3, import_report: { route_id: "r-123", spot_ids: [], errors: [] },
    })});
    addResponse({ ok: true, status: 200, json: async () => [{}] });
    const resp = await handler({
      method: "POST", url: `${BASE}/${SESSION3}/confirm`,
      async json() { return { confirmed: true }; },
    });
    sEq(resp.status, 200);
    sEq(resp.body.status, "confirmed");
    sEq(resp.body.import_report.route_id, "r-123");
  });

  // ── POST /:session_id/gap-reply ──────────────────────────────────
  console.log("\n【 POST /:session_id/gap-reply 】");
  await test("POST gap-reply → 转发 Agent", async () => {
    addAgentResponse({ ok: true, status: 200, json: async () => ({ status: "ok", session_id: SESSION }) });
    const resp = await handler({
      method: "POST", url: `${BASE}/${SESSION}/gap-reply`,
      async json() { return { overrides: [{ field: "0:lat", value: "39.89,116.39" }] }; },
    });
    sEq(resp.status, 200);
    sEq(resp.body.status, "ok");
    sT(_requests.some((r) => r.url.includes("route-upload/gap-reply")));
  });

  // ── OPTIONS ─────────────────────────────────────────────────────
  console.log("\n【 OPTIONS 预检 】");
  await test("OPTIONS → 200", async () => {
    const resp = await handler({ method: "OPTIONS", url: `${BASE}` });
    sEq(resp.status, 200);
  });
}

console.log("\n-- route-ingest Edge Function 路由级测试 --\n");
runTests()
  .then(() => {
    console.log(`\n${"--".repeat(50)}`);
    console.log(`结果：${passed} 通过，${failed} 失败`);
    if (failed > 0) process.exit(1);
  })
  .catch((e) => {
    console.error("测试框架异常:", e);
    process.exit(1);
  });
