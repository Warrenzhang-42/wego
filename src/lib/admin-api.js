/**
 * WeGO Admin API Client — admin-api.js
 * Sprint 10
 *
 * 管理后台专用 SDK：前端直连 Supabase，使用 service_role key 绕过 RLS。
 * 仅供 admin-routes.html 页面使用，不与前台 api-client.js 共享。
 *
 * 关键约束：
 *   - heat_level / heat_count 仅支持读取，写入操作会静默忽略这两个字段
 *   - 坐标系：lat/lng 以 WGS-84 存储，录入/展示均不做转换
 */

'use strict';

/* ============================================================
   配置读取
   ============================================================ */
const _cfg = window.__WEGO_API_CONFIG__ || {};
const _serviceKey = _cfg.supabaseServiceKey;
const _url = _cfg.supabaseUrl;

if (!_serviceKey || !_url) {
  console.error('[admin-api] 缺少配置：需要 supabaseUrl 和 supabaseServiceKey');
}

/* ============================================================
   Supabase 客户端（service role，绕过 RLS）
   ============================================================ */
let _client = null;

async function _getClient() {
  if (_client) return _client;
  if (!window.supabase) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Supabase SDK 加载失败'));
      document.head.appendChild(s);
    });
  }
  _client = window.supabase.createClient(_url, _serviceKey);
  return _client;
}

/* ============================================================
   工具函数
   ============================================================ */
function _stripHeatFields(patch) {
  const { heat_level, heat_count, ...safe } = patch;
  return safe;
}

/* ============================================================
   路线 API
   ============================================================ */

/**
 * 路线列表（支持搜索、过滤、分页）
 * @param {Object} opts
 * @param {string}   opts.search     - title 模糊搜索
 * @param {string}   opts.category   - category 精确过滤
 * @param {string}   opts.difficulty - difficulty 精确过滤
 * @param {number}   opts.page       - 页码（从 1 开始）
 * @param {number}   opts.pageSize    - 每页条数（默认 20）
 * @returns {{ data: Array, total: number, page: number, pageSize: number }}
 */
async function getRoutesAdmin({ search, category, difficulty, page = 1, pageSize = 20 } = {}) {
  const sb = await _getClient();
  let query = sb.from('routes').select('*', { count: 'exact' });

  if (search)    query = query.ilike('title', `%${search}%`);
  if (category)  query = query.eq('category', category);
  if (difficulty) query = query.eq('difficulty', difficulty);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) throw new Error(`[admin-api] getRoutesAdmin 失败: ${error.message}`);
  return { data: data || [], total: count || 0, page, pageSize };
}

/**
 * 单条路线（含关联景点，按 sort_order 排序）
 */
async function getRouteAdmin(id) {
  const sb = await _getClient();
  const [route, spots] = await Promise.all([
    sb.from('routes').select('*').eq('id', id).single(),
    sb.from('spots').select('*').eq('route_id', id).order('sort_order', { ascending: true }),
  ]);
  if (route.error) throw new Error(`[admin-api] getRouteAdmin 失败: ${route.error.message}`);
  return { ...route.data, spots: spots.data || [] };
}

/**
 * 更新路线（静默忽略 heat_level / heat_count）
 * @param {string} id    - route UUID
 * @param {Object} patch - 允许字段：title, description, tags, category, difficulty, duration_minutes, total_distance_km, cover_image
 */
async function updateRoute(id, patch) {
  const sb = await _getClient();
  const safe = _stripHeatFields(patch);
  const { data, error } = await sb
    .from('routes')
    .update({ ...safe, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`[admin-api] updateRoute 失败: ${error.message}`);
  return data;
}

/**
 * 删除路线（级联删除关联景点，由 DB 外键 ON DELETE CASCADE 实现）
 */
async function deleteRoute(id) {
  const sb = await _getClient();
  const { error } = await sb.from('routes').delete().eq('id', id);
  if (error) throw new Error(`[admin-api] deleteRoute 失败: ${error.message}`);
  return { id };
}

/* ============================================================
   景点 API
   ============================================================ */

/**
 * 获取某路线的景点列表（按 sort_order 排序）
 */
async function getSpotsAdmin(routeId) {
  const sb = await _getClient();
  const { data, error } = await sb
    .from('spots')
    .select('*')
    .eq('route_id', routeId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`[admin-api] getSpotsAdmin 失败: ${error.message}`);
  return data || [];
}

/**
 * 更新景点
 * @param {string} id    - spot UUID
 * @param {Object} patch - 允许字段：name, subtitle, short_desc, detail, tags, thumb, photos, lat, lng, geofence_radius_m, estimated_stay_min, sort_order
 */
async function updateSpot(id, patch) {
  const sb = await _getClient();
  const { data, error } = await sb
    .from('spots')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`[admin-api] updateSpot 失败: ${error.message}`);
  return data;
}

/**
 * 删除景点
 */
async function deleteSpot(id) {
  const sb = await _getClient();
  const { error } = await sb.from('spots').delete().eq('id', id);
  if (error) throw new Error(`[admin-api] deleteSpot 失败: ${error.message}`);
  return { id };
}

/* ============================================================
   导出
   ============================================================ */
export const adminApi = {
  // 路线
  getRoutesAdmin,
  getRouteAdmin,
  updateRoute,
  deleteRoute,
  // 景点
  getSpotsAdmin,
  updateSpot,
  deleteSpot,
};
