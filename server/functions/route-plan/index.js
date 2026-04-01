/**
 * Route Plan Edge Function - server/functions/route-plan/index.js
 *
 * 路线规划 API – Sprint 7.3
 * 接收用户规划请求，返回符合 route-plan-response 契约的 JSON。
 * 在生产中，此函数通过 Supabase Edge Functions 或 Node 服务部署。
 * 开发阶段由 agent/server.py 代替 Python Agent 调用。
 *
 * POST /route-plan
 * Body: { user_query, current_lat?, current_lng?, constraints? }
 * Response: { route_name, total_distance_km, total_duration_min, total_walk_min, waypoints, polyline, narration }
 */

// ─── 契约校验 ─────────────────────────────────────────────
/**
 * 校验 route-plan-response 是否符合 JSON Schema 契约。
 * @param {object} route
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateRoutePlanResponse(route) {
  const errors = [];
  const required = ['route_name', 'total_distance_km', 'total_duration_min', 'waypoints'];
  for (const key of required) {
    if (route[key] === undefined || route[key] === null) {
      errors.push(`Missing required field: ${key}`);
    }
  }
  if (!Array.isArray(route.waypoints) || route.waypoints.length === 0) {
    errors.push('waypoints must be a non-empty array');
  }
  if (typeof route.total_distance_km !== 'number') {
    errors.push('total_distance_km must be a number');
  }
  return { valid: errors.length === 0, errors };
}

// ─── 请求处理器 ────────────────────────────────────────────
/**
 * 处理路线规划请求。
 * 实际调用通过 Python Agent Server（agent/server.py）完成，
 * 此 JS 层负责请求校验、格式标准化和错误处理。
 *
 * @param {Request} request  Fetch API Request 对象
 * @param {object} env       环境变量（Supabase Edge）
 * @returns {Response}
 */
async function handleRoutePlan(request, env) {
  // 1. 仅接受 POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. 解析请求体
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const {
    user_query,
    current_lat = 39.8973,
    current_lng = 116.3976,
    constraints = {}
  } = body;

  if (!user_query || typeof user_query !== 'string' || !user_query.trim()) {
    return new Response(JSON.stringify({ error: 'user_query is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 3. 调用 Python Agent Server（开发阶段）或直接用内置逻辑（生产可替换）
  const agentBaseUrl = (env && env.AGENT_BASE_URL) || 'http://localhost:8000';

  try {
    const agentRes = await fetch(`${agentBaseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: user_query,
        trigger_type: 'route_plan',
        current_lat,
        current_lng,
        constraints
      })
    });

    if (!agentRes.ok) {
      throw new Error(`Agent returned ${agentRes.status}`);
    }

    const agentData = await agentRes.json();

    // 4. 从 Agent 回复中提取 route 字段
    const route = agentData.route || null;

    if (!route) {
      // Agent 未返回路线（可能是因为意图不匹配），降级返回 Mock 数据
      return new Response(JSON.stringify(buildFallbackRoute(user_query, constraints)), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Route-Source': 'fallback' }
      });
    }

    // 5. 契约校验
    const { valid, errors } = validateRoutePlanResponse(route);
    if (!valid) {
      console.warn('[route-plan] Agent response failed contract validation:', errors);
      return new Response(JSON.stringify({ error: 'Contract validation failed', details: errors }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(route), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Route-Source': 'agent' }
    });

  } catch (err) {
    console.error('[route-plan] Agent call failed:', err.message);
    // 降级：返回 fallback 路线，保证前端体验不中断
    return new Response(JSON.stringify(buildFallbackRoute(user_query, constraints)), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Route-Source': 'fallback-error' }
    });
  }
}

// ─── 降级路线（Fallback） ──────────────────────────────────
/**
 * 当 Agent 不可用时返回的静态兜底路线，
 * 确保符合 route-plan-response 契约。
 */
function buildFallbackRoute(userQuery = '精品 CityWalk', constraints = {}) {
  const maxHours = constraints.max_hours || 4;
  const spots = maxHours <= 2
    ? [
        { name: '前门大街入口', lat: 39.8973, lng: 116.3976, estimated_stay_min: 10, description: '步入繁华老街' },
        { name: '张忠强兔儿爷非遗传承店', lat: 39.8966, lng: 116.3962, estimated_stay_min: 30, description: '非遗兔儿爷泥塑体验' },
        { name: '青云阁及二层模范咖啡', lat: 39.8960, lng: 116.3958, estimated_stay_min: 40, description: '历史阁楼+精品咖啡' }
      ]
    : [
        { name: '前门大街入口', lat: 39.8973, lng: 116.3976, estimated_stay_min: 10, description: '步入繁华老街' },
        { name: '张忠强兔儿爷非遗传承店', lat: 39.8966, lng: 116.3962, estimated_stay_min: 30, description: '非遗兔儿爷泥塑体验' },
        { name: '青云阁及二层模范咖啡', lat: 39.8960, lng: 116.3958, estimated_stay_min: 45, description: '历史阁楼+精品咖啡' },
        { name: '乾坤空间文创', lat: 39.8956, lng: 116.3952, estimated_stay_min: 25, description: '可以逛的艺术展览' },
        { name: '铃木食堂', lat: 39.8945, lng: 116.3943, estimated_stay_min: 60, description: '高情绪价值型餐厅收尾' }
      ];

  const totalStay = spots.reduce((s, sp) => s + sp.estimated_stay_min, 0);

  return {
    route_name: `${userQuery} · WeGO 精选路线`,
    total_distance_km: parseFloat((spots.length * 0.18).toFixed(2)),
    total_duration_min: totalStay + 25,
    total_walk_min: 25,
    waypoints: spots,
    polyline: spots.map(s => ({ lat: s.lat, lng: s.lng })),
    narration: `好嘞！给您安排了「${userQuery}」路线，共 ${spots.length} 站，边走边玩约 ${totalStay + 25} 分钟，轻松又地道！`
  };
}

// ─── 导出（兼容 Supabase Edge + Node.js 两种部署方式） ───────
// Supabase Edge Functions 入口
if (typeof Deno !== 'undefined') {
  Deno.serve(handleRoutePlan);
}

// Node.js / Express 兼容导出
if (typeof module !== 'undefined') {
  module.exports = { handleRoutePlan, validateRoutePlanResponse, buildFallbackRoute };
}
