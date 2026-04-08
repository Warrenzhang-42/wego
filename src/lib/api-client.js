/**
 * WeGO API Client — api-client.js
 * Sprint 2.7
 *
 * DB-First 模式：
 *   - 路线/景点等业务数据强制走后端 API（数据库）
 *   - 不再回落本地 JSON，避免“代码数据源”和“数据库数据源”混淆
 */

'use strict';

/* ============================================================
  配置检测
  ============================================================ */
const _cfg = window.__WEGO_API_CONFIG__ || {};
const _hasBackend = Boolean(_cfg.apiBaseUrl);
const _token = () => localStorage.getItem('wego_access_token') || '';

/** @param {unknown} raw */
function _normalizeMapEngine(raw) {
  const v = String(raw == null ? 'amap' : raw)
    .toLowerCase()
    .trim();
  if (v === 'amap' || v === 'mapbox' || v === 'bmap') return v;
  return 'amap';
}

/* ============================================================
  Backend 数据源实现（需配置 window.__WEGO_API_CONFIG__.apiBaseUrl）
  ============================================================ */
const _backendSource = {
  async _request(path, opts = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    };
    const token = _token();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${_cfg.apiBaseUrl}${path}`, { ...opts, headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`[api-client] ${path} 失败: ${res.status} ${text}`);
    }
    return res.json();
  },
  async getRoute(id) {
    return this._request(`/api/routes/${id}`);
  },

  async getSpots(routeId) {
    return this._request(`/api/routes/${routeId}/spots`);
  },

  async getRouteWithSpots(id) {
    const [route, spots] = await Promise.all([this.getRoute(id), this.getSpots(id)]);
    return { ...route, spots };
  },

  async getRoutes(filters = {}) {
    const q = new URLSearchParams();
    if (filters.tag) q.set('tag', filters.tag);
    if (filters.city_adcode) q.set('city_adcode', filters.city_adcode);
    if (filters.search) q.set('search', filters.search);
    return this._request(`/api/routes?${q.toString()}`);
  },

  async saveCheckin(data) {
    return this._request('/api/checkins', {
      method: 'POST',
      body: JSON.stringify({
        spot_id: data.spot_id,
        lat: data.lat,
        lng: data.lng,
        photos: data.photos || [],
        ai_summary: data.ai_summary || null,
      }),
    });
  },

  async getCheckins(userId) {
    const rows = await this._request('/api/checkins');
    if (userId) return rows.filter((r) => r.user_id === userId);
    return rows;
  },

  /**
   * 首页轮播：若存在 city:{adcode} 行则仅用该行（含空数组，不再回落 general）；否则用 general。
   * @param {string} cityAdcode 六位国标城市码
   */
  async getHomeCarousel(cityAdcode) {
    const q = new URLSearchParams();
    if (cityAdcode) q.set('city_adcode', String(cityAdcode));
    return this._request(`/api/carousel?${q.toString()}`);
  },

  /**
   * 地图引擎：读取 app_public_settings.map_engine，缺省或非法值回落 amap（高德）
   * @returns {Promise<'amap'|'mapbox'|'bmap'>}
   */
  async getMapEngine() {
    const data = await this._request('/api/settings/map-engine');
    return _normalizeMapEngine(data?.setting_value);
  },
};

/* ============================================================
  导出：apiClient — 强制 Backend（数据库）数据源
   ============================================================ */
const _missingBackendSource = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === 'mode') return 'missing-backend';
      return async () => {
        throw new Error(
          '[api-client] 未配置 window.__WEGO_API_CONFIG__.apiBaseUrl，已禁用本地路线兜底。请先启动并配置后端 API。'
        );
      };
    },
  }
);

export const apiClient = _hasBackend ? _backendSource : _missingBackendSource;

// 暴露当前模式，便于调试
apiClient.mode = _hasBackend ? 'backend' : 'missing-backend';

console.log(`[api-client] 数据源模式: ${apiClient.mode}`);
