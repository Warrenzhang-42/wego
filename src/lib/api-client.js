/**
 * WeGO API Client — api-client.js
 * Sprint 2.7
 *
 * LocalFirst 模式：
 *   - 优先读取本地 JSON 文件（开发/无网络场景）
 *   - 若配置了 SUPABASE_URL，则透明切换到真实 Supabase 数据库
 *   - 上层调用代码无需任何改动
 *
 * 使用示例：
 *   import { apiClient } from './lib/api-client.js';
 *   const route = await apiClient.getRoute('e4e20790-...');
 *   const spots = await apiClient.getSpots(route.id);
 */

'use strict';

/* ============================================================
   配置检测 — 自动选择数据源
   ============================================================ */
const _cfg = window.__WEGO_API_CONFIG__ || {};
const _hasSupabase = Boolean(_cfg.supabaseUrl && _cfg.supabaseAnonKey);

// 本地 JSON 数据文件的根路径（相对于 src/）
const _LOCAL_DATA_ROOT = '../data/routes/';

// 已知路线 ID 到文件名的映射（LocalFirst 模式）
const _ROUTE_FILE_MAP = {
  'e4e20790-a521-4f0e-947b-1172a1e1b7f1': 'dashilan.json',
};

/* ============================================================
   LocalFirst 数据源实现
   ============================================================ */
const _localSource = {
  async getRoute(id) {
    const filename = _ROUTE_FILE_MAP[id];
    if (!filename) throw new Error(`[api-client] 本地不存在路线: ${id}`);

    const resp = await fetch(`${_LOCAL_DATA_ROOT}${filename}`);
    if (!resp.ok) throw new Error(`[api-client] 读取路线文件失败: HTTP ${resp.status}`);

    const data = await resp.json();
    // 返回：剥离 spots，只返回路线元数据（与 Supabase 版本行为一致）
    const { spots, ...route } = data;
    return route;
  },

  async getSpots(routeId) {
    const filename = _ROUTE_FILE_MAP[routeId];
    if (!filename) throw new Error(`[api-client] 本地不存在路线: ${routeId}`);

    const resp = await fetch(`${_LOCAL_DATA_ROOT}${filename}`);
    if (!resp.ok) throw new Error(`[api-client] 读取景点文件失败: HTTP ${resp.status}`);

    const data = await resp.json();
    const spots = (data.spots || []).map(s => ({ ...s, route_id: routeId }));
    // 按 sort_order 排序
    return spots.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  },

  async getRouteWithSpots(id) {
    const filename = _ROUTE_FILE_MAP[id];
    if (!filename) throw new Error(`[api-client] 本地不存在路线: ${id}`);

    const resp = await fetch(`${_LOCAL_DATA_ROOT}${filename}`);
    if (!resp.ok) throw new Error(`[api-client] 读取路线文件失败: HTTP ${resp.status}`);

    const data = await resp.json();
    const spots = (data.spots || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    return { ...data, spots };
  },

  async getRoutes(filters = {}) {
    // LocalFirst 模式返回所有已知路线的 meta
    const results = [];
    for (const [id, filename] of Object.entries(_ROUTE_FILE_MAP)) {
      try {
        const resp = await fetch(`${_LOCAL_DATA_ROOT}${filename}`);
        if (!resp.ok) continue;
        const data = await resp.json();
        const { spots, ...route } = data;
        // 简单过滤
        if (filters.difficulty && route.difficulty !== filters.difficulty) continue;
        if (filters.tag && !(route.tags || []).some(t => t.includes(filters.tag))) continue;
        results.push(route);
      } catch (e) {
        console.warn(`[api-client] 跳过路线文件 ${filename}:`, e.message);
      }
    }
    return results;
  },

  async saveCheckin(data) {
    // LocalFirst：打卡数据存入 localStorage（后期接入 Supabase 时替换）
    const key = 'wego_checkins';
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    const record = {
      id:         crypto.randomUUID(),
      spot_id:    data.spot_id,
      lat:        data.lat,
      lng:        data.lng,
      photos:     data.photos || [],
      ai_summary: data.ai_summary || null,
      created_at: new Date().toISOString(),
    };
    existing.push(record);
    localStorage.setItem(key, JSON.stringify(existing));
    console.log('[api-client] 打卡记录已保存到 localStorage:', record.id);
    return record;
  },

  async getCheckins(userId) {
    // LocalFirst：从 localStorage 读取（userId 暂未使用）
    const key = 'wego_checkins';
    return JSON.parse(localStorage.getItem(key) || '[]');
  },
};

/* ============================================================
   Supabase 数据源实现（需配置 window.__WEGO_API_CONFIG__）
   ============================================================ */
const _supabaseSource = {
  _client: null,

  async _getClient() {
    if (this._client) return this._client;

    // 动态加载 Supabase JS SDK
    if (!window.supabase) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Supabase SDK 加载失败'));
        document.head.appendChild(s);
      });
    }

    this._client = window.supabase.createClient(_cfg.supabaseUrl, _cfg.supabaseAnonKey);
    return this._client;
  },

  async getRoute(id) {
    const sb = await this._getClient();
    const { data, error } = await sb.from('routes').select('*').eq('id', id).single();
    if (error) throw new Error(`[api-client] getRoute 失败: ${error.message}`);
    return data;
  },

  async getSpots(routeId) {
    const sb = await this._getClient();
    const { data, error } = await sb
      .from('spots')
      .select('*')
      .eq('route_id', routeId)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`[api-client] getSpots 失败: ${error.message}`);
    return data;
  },

  async getRouteWithSpots(id) {
    const [route, spots] = await Promise.all([this.getRoute(id), this.getSpots(id)]);
    return { ...route, spots };
  },

  async getRoutes(filters = {}) {
    const sb = await this._getClient();
    let query = sb.from('routes').select('*');
    if (filters.difficulty) query = query.eq('difficulty', filters.difficulty);
    const { data, error } = await query;
    if (error) throw new Error(`[api-client] getRoutes 失败: ${error.message}`);
    // 标签过滤（Supabase 数组包含）
    if (filters.tag) return data.filter(r => (r.tags || []).some(t => t.includes(filters.tag)));
    return data;
  },

  async saveCheckin(data) {
    const sb = await this._getClient();
    const { data: record, error } = await sb.from('user_checkins').insert({
      spot_id:    data.spot_id,
      lat:        data.lat,
      lng:        data.lng,
      photos:     data.photos     || [],
      ai_summary: data.ai_summary || null,
    }).select().single();
    if (error) throw new Error(`[api-client] saveCheckin 失败: ${error.message}`);
    return record;
  },

  async getCheckins(userId) {
    const sb = await this._getClient();
    let query = sb.from('user_checkins').select('*').order('created_at', { ascending: false });
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) throw new Error(`[api-client] getCheckins 失败: ${error.message}`);
    return data;
  },
};

/* ============================================================
   导出：apiClient — 自动选择数据源，接口统一
   ============================================================ */
export const apiClient = _hasSupabase ? _supabaseSource : _localSource;

// 暴露当前模式，便于调试
apiClient.mode = _hasSupabase ? 'supabase' : 'local';

console.log(`[api-client] 数据源模式: ${apiClient.mode}`);
