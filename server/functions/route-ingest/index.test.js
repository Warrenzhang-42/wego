/**
 * WeGO · route-ingest/index.test.js
 * Sprint 11.5.1 — Edge Function 路由级测试
 *
 * 运行方式（需要 Deno 1.40+）：
 *   cd server/functions/route-ingest
 *   deno test --allow-env --allow-net --allow-read index.test.js
 *
 * 测试覆盖：
 *   ✓ POST /  (主入口：上传+解析，mock Agent)
 *   ✓ GET  /:session_id  (状态查询)
 *   ✓ POST /:session_id/confirm  (确认写入)
 *   ✓ POST /:session_id/gap-reply  (Gap 回答)
 *   ✓ OPTIONS 预检
 *   ✓ 参数校验 400
 *   ✓ Agent 离线时降级到 Mock
 */
import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── 模拟 Deno.env ───────────────────────────────────────────
const mockEnv = {
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  AGENT_BASE_URL: "http://localhost:8000",
};
const originalEnv = { ...Deno.env };
Deno.env.get = (k) => mockEnv[k];
Deno.env.set = (k, v) => { mockEnv[k] = v; };

// ── 模拟 fetch ──────────────────────────────────────────────
// requests 数组由每个 test case 填充
const requests = [];
const responses = [];
let reqIdx = 0;

globalThis.fetch = async (url, opts) => {
  const entry = { url: String(url), method: opts?.method || "GET", body: opts?.body };
  requests.push(entry);
  if (reqIdx >= responses.length) {
    return { ok: false, status: 500, json: async () => ({ error: "No mock response" })};
  }
  const r = responses[reqIdx++];
  if (r instanceof Error) throw r;
  return r;
};

// ── 测试用 Session ID ────────────────────────────────────────
const SESSION = "11111111-1111-1111-1111-111111111111";
const SESSION2 = "22222222-2222-2222-2222-222222222222";
const SESSION3 = "33333333-3333-3333-3333-333333333333";

// ─────────────────────────────────────────────────────────────
import { validateUploadRequest, buildMockResult } from "./index.js";

// ══════════════════════════════════════════════════════════════
// 测试 1: validateUploadRequest
// ══════════════════════════════════════════════════════════════
Deno.test("validateUploadRequest: 合法请求返回空错误数组", () => {
  const errs = validateUploadRequest({
    session_id: SESSION,
    file_content: '{"title":"test"}',
    file_type: "json",
  });
  assertEquals(errs, []);
});

Deno.test("validateUploadRequest: 缺少 session_id", () => {
  const errs = validateUploadRequest({ file_content: "{}", file_type: "json" });
  assertEquals(errs.length, 1);
  assertStringIncludes(errs[0], "session_id");
});

Deno.test("validateUploadRequest: 非法 file_type", () => {
  const errs = validateUploadRequest({
    session_id: SESSION, file_content: "x", file_type: "pdf",
  });
  assertEquals(errs.length, 1);
  assertStringIncludes(errs[0], "file_type");
});

Deno.test("validateUploadRequest: 多项错误同时返回", () => {
  const errs = validateUploadRequest({});
  assert(errs.length >= 2);
});

// ══════════════════════════════════════════════════════════════
// 测试 2: buildMockResult
// ══════════════════════════════════════════════════════════════
Deno.test("buildMockResult: JSON 格式提取景点", () => {
  const result = buildMockResult(
    SESSION,
    JSON.stringify({ title: "测试路线", spots: [{ name: "前门", lat: 39.89, lng: 116.39 }] }),
    "json",
  );
  assertEquals(result.status, "success");
  assertEquals(result.route_preview.spots.length, 1);
  assertEquals(result.route_preview.route_name, "未命名路线"); // JSON 没有 title 字段时取默认值
});

Deno.test("buildMockResult: 带坐标缺失时产生 gap", () => {
  const result = buildMockResult(
    SESSION,
    JSON.stringify({ title: "路线", spots: [{ name: "前门" }] }),
    "json",
  );
  assertEquals(result.status, "has_gaps");
  assert(result.gaps.some((g) => g.field === "0:lat"));
});

Deno.test("buildMockResult: 纯文本每行一个景点", () => {
  const result = buildMockResult(SESSION, "前门\n杨梅竹斜街", "txt");
  assertEquals(result.route_preview.spots.length, 2);
  assertEquals(result.status, "has_gaps");
});

// ══════════════════════════════════════════════════════════════
// 测试 3: 模拟完整 POST / 流程（Agent 在线）
// ══════════════════════════════════════════════════════════════
Deno.test("POST /: 正常上传 + Agent 返回 has_gaps → 草稿写入 gaps_filling", async () => {
  reqIdx = 0;
  requests.length = 0;
  // Mock 顺序: POST route_drafts(insert), PATCH route_drafts(update), POST Agent
  responses.push(
    { ok: true, status: 201, json: async () => [{}] },           // insert
    { ok: true, status: 200, json: async () => [{}] },           // update
    { ok: true, status: 200, json: async () => ({
      status: "has_gaps",
      session_id: SESSION,
      route_preview: { route_name: "测试路线", spots: [{ name: "前门" }] },
      gaps: [{ field: "0:lat", gap_type: "subjective", message: "请提供坐标" }],
    })},                                                            // Agent
  );

  const handler = (await import("./index.js")).handler ||
    (await import("./index.js")).default?.handler;
  if (!handler) { assert(false, "无法找到 Deno.serve 处理器，请确认 index.js 导出方式"); return; }

  const resp = await handler({
    method: "POST",
    url: `http://localhost:54321/functions/v1/route-ingest`,
    headers: new Headers({ "content-type": "application/json" }),
    async json() { return { session_id: SESSION, file_content: "{}", file_type: "json" }; },
  });
  assertEquals(resp.status, 200);
  const body = await resp.json();
  assertEquals(body.status, "has_gaps");
  assertEquals(body.gaps.length, 1);
  // 验证 POST route_drafts 被调用（insert + update 各一次）
  const drafts = requests.filter((r) => r.url.includes("route_drafts"));
  assert(drafts.length >= 2, `期望 >=2 次 route_drafts 调用，实际 ${drafts.length}`);
});

// ══════════════════════════════════════════════════════════════
// 测试 4: Agent 离线 → 降级到 buildMockResult
// ══════════════════════════════════════════════════════════════
Deno.test("POST /: Agent 离线时使用 Mock 结果", async () => {
  reqIdx = 0;
  requests.length = 0;
  responses.push(
    { ok: true, status: 201, json: async () => [{}] },
    { ok: true, status: 200, json: async () => [{}] },
    new Error("Agent offline"),  // Agent 调用失败
  );

  const handler = (await import("./index.js")).handler ||
    (await import("./index.js")).default?.handler;
  const resp = await handler({
    method: "POST",
    url: `http://localhost:54321/functions/v1/route-ingest`,
    headers: new Headers({ "content-type": "application/json" }),
    async json() {
      return {
        session_id: SESSION2,
        file_content: JSON.stringify({ title: "降级测试", spots: [] }),
        file_type: "json",
      };
    },
  });
  assertEquals(resp.status, 200);
  const body = await resp.json();
  assert(body.status === "has_gaps" || body.status === "success",
    `期望 has_gaps|success，实际 ${body.status}`);
});

// ══════════════════════════════════════════════════════════════
// 测试 5: GET /:session_id — 找到记录
// ══════════════════════════════════════════════════════════════
Deno.test("GET /:session_id: 找到草稿", async () => {
  reqIdx = 0;
  requests.length = 0;
  responses.push({
    ok: true, status: 200, json: async () => [{
      session_id: SESSION3,
      status: "gaps_filling",
      parsed_data: { route_name: "测试" },
      gap_items: [{ field: "0:lat", gap_type: "subjective", message: "请提供" }],
    }],
  });

  const handler = (await import("./index.js")).handler ||
    (await import("./index.js")).default?.handler;
  const resp = await handler({
    method: "GET",
    url: `http://localhost:54321/functions/v1/route-ingest/${SESSION3}`,
    headers: new Headers({}),
  });
  assertEquals(resp.status, 200);
  const body = await resp.json();
  assertEquals(body.status, "gaps_filling");
  assertEquals(body.gap_items.length, 1);
});

// ══════════════════════════════════════════════════════════════
// 测试 6: GET /:session_id — Session 不存在
// ══════════════════════════════════════════════════════════════
Deno.test("GET /:session_id: Session 不存在返回 404", async () => {
  reqIdx = 0;
  requests.length = 0;
  responses.push({ ok: true, status: 200, json: async () => [] });

  const handler = (await import("./index.js")).handler ||
    (await import("./index.js")).default?.handler;
  const resp = await handler({
    method: "GET",
    url: `http://localhost:54321/functions/v1/route-ingest/99999999-9999-9999-9999-999999999999`,
    headers: new Headers({}),
  });
  assertEquals(resp.status, 404);
});

// ══════════════════════════════════════════════════════════════
// 测试 7: POST /:session_id/confirm — 确认写入
// ══════════════════════════════════════════════════════════════
Deno.test("POST /:session_id/confirm: 确认后写入 + 状态更新", async () => {
  reqIdx = 0;
  requests.length = 0;
  responses.push(
    // 读取草稿
    { ok: true, status: 200, json: async () => [{
      session_id: SESSION3,
      parsed_data: { route_name: "确认路线", spots: [] },
      user_overrides: [],
    }]},
    // Agent confirm
    { ok: true, status: 200, json: async () => ({
      status: "confirmed",
      session_id: SESSION3,
      route_preview: { route_name: "确认路线" },
      import_report: { route_id: "r-123", spot_ids: [], errors: [] },
    })},
    // PATCH 更新状态
    { ok: true, status: 200, json: async () => [{}] },
  );

  const handler = (await import("./index.js")).handler ||
    (await import("./index.js")).default?.handler;
  const resp = await handler({
    method: "POST",
    url: `http://localhost:54321/functions/v1/route-ingest/${SESSION3}/confirm`,
    headers: new Headers({ "content-type": "application/json" }),
    async json() { return { confirmed: true }; },
  });
  assertEquals(resp.status, 200);
  const body = await resp.json();
  assertEquals(body.status, "confirmed");
  assertEquals(body.import_report.route_id, "r-123");
});

// ══════════════════════════════════════════════════════════════
// 测试 8: POST /:session_id/gap-reply
// ══════════════════════════════════════════════════════════════
Deno.test("POST /:session_id/gap-reply: 转发到 Agent", async () => {
  reqIdx = 0;
  requests.length = 0;
  responses.push({
    ok: true, status: 200, json: async () => ({ status: "ok", session_id: SESSION }),
  });

  const handler = (await import("./index.js")).handler ||
    (await import("./index.js")).default?.handler;
  const resp = await handler({
    method: "POST",
    url: `http://localhost:54321/functions/v1/route-ingest/${SESSION}/gap-reply`,
    headers: new Headers({ "content-type": "application/json" }),
    async json() { return { overrides: [{ field: "0:lat", value: "39.89,116.39" }] }; },
  });
  assertEquals(resp.status, 200);
  const body = await resp.json();
  assertEquals(body.status, "ok");
  // 验证调用的是 route-upload/gap-reply 端点
  assert(requests.some((r) => r.url.includes("route-upload/gap-reply")));
});

// ══════════════════════════════════════════════════════════════
// 测试 9: CORS 预检
// ══════════════════════════════════════════════════════════════
Deno.test("OPTIONS: 返回 200 + CORS 头", async () => {
  const handler = (await import("./index.js")).handler ||
    (await import("./index.js")).default?.handler;
  const resp = await handler({
    method: "OPTIONS",
    url: "http://localhost:54321/functions/v1/route-ingest",
    headers: new Headers({}),
  });
  assertEquals(resp.status, 200);
  assert(resp.headers.get("Access-Control-Allow-Origin") === "*");
});

// ══════════════════════════════════════════════════════════════
// 测试 10: 参数校验 400
// ══════════════════════════════════════════════════════════════
Deno.test("POST /: 非法 file_type 返回 400", async () => {
  const handler = (await import("./index.js")).handler ||
    (await import("./index.js")).default?.handler;
  const resp = await handler({
    method: "POST",
    url: `http://localhost:54321/functions/v1/route-ingest`,
    headers: new Headers({ "content-type": "application/json" }),
    async json() {
      return { session_id: SESSION, file_content: "x", file_type: "binary" };
    },
  });
  assertEquals(resp.status, 400);
});
