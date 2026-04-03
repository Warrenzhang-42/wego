/**
 * 管理后台「游玩点」弹窗：高德底图 + 地点搜索。
 * 表单经纬度一律按 GCJ-02（高德）展示与编辑；入库由 admin 层转 WGS-84。
 * 红点 = 已写入表单的坐标；点选/搜索产生蓝点候选，红点不动；确认后蓝点消失、红点更新。
 * 「回到已保存点」：视野移到红点，并清除蓝点候选。
 */

'use strict';

/**
 * @typedef {Object} AdminSpotMapCfg
 * @property {string} mapContainerId
 * @property {string} searchInputId
 * @property {string} searchButtonId
 * @property {string} commitButtonId
 * @property {string} recenterButtonId
 * @property {string} statusTextId
 * @property {string} latInputId
 * @property {string} lngInputId
 * @property {(type: 'success'|'error'|'info', message: string) => void} [toast]
 */

/** @type {any} */
let _map = null;
/** @type {any} */
let _markerSaved = null;
/** @type {any} */
let _markerPending = null;
/** @type {{ lat: number, lng: number } | null} */
let _pendingGcj = null;
/** @type {boolean} */
let _placeSearchReady = false;
/** @type {boolean} */
let _pickUiBound = false;

/**
 * @param {string} apiKey
 * @param {string} securityCode
 */
function loadAmapBase(apiKey, securityCode) {
  return new Promise((resolve, reject) => {
    if (window.AMap) {
      resolve();
      return;
    }
    if (!apiKey || !securityCode) {
      reject(new Error('缺少高德 Key 或安全密钥'));
      return;
    }
    window._AMapSecurityConfig = { securityJsCode: securityCode };
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.onload = () => {
      if (window.AMap) resolve();
      else reject(new Error('高德 SDK 未挂载'));
    };
    script.onerror = () => reject(new Error('高德脚本加载失败'));
    document.head.appendChild(script);
  });
}

function ensurePlaceSearchPlugin() {
  return new Promise((resolve, reject) => {
    if (_placeSearchReady) {
      resolve();
      return;
    }
    if (!window.AMap) {
      reject(new Error('AMap 未就绪'));
      return;
    }
    window.AMap.plugin('AMap.PlaceSearch', () => {
      _placeSearchReady = true;
      resolve();
    });
  });
}

/**
 * 表单数字一律视为 GCJ-02（与高德底图一致）。
 * @returns {{ lat: number, lng: number } | null}
 */
function readGcjFromForm(latInputId, lngInputId) {
  const latEl = document.getElementById(latInputId);
  const lngEl = document.getElementById(lngInputId);
  if (!latEl || !lngEl) return null;
  const lat = parseFloat(latEl.value);
  const lng = parseFloat(lngEl.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * @param {number} lat GCJ-02
 * @param {number} lng GCJ-02
 */
function writeGcjToForm(lat, lng, latInputId, lngInputId) {
  const latEl = document.getElementById(latInputId);
  const lngEl = document.getElementById(lngInputId);
  if (!latEl || !lngEl) return;
  latEl.value = String(Number(lat.toFixed(7)));
  lngEl.value = String(Number(lng.toFixed(7)));
}

const DEFAULT_GCJ = { lng: 116.397428, lat: 39.90923 };

const SAVED_MARKER_HTML =
  '<div style="width:26px;height:26px;border-radius:50%;background:rgba(220,38,38,0.95);border:3px solid #7f1d1d;box-sizing:border-box;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,0.3);" title="已确认坐标（表单，高德 GCJ-02）"></div>';

const PENDING_MARKER_HTML =
  '<div style="width:26px;height:26px;border-radius:50%;background:rgba(37,99,235,0.25);border:3px solid #1d4ed8;box-sizing:border-box;pointer-events:none;" title="候选点（未确认）"></div>';

/**
 * @param {AdminSpotMapCfg} cfg
 */
function refreshPickUi(cfg) {
  const commitBtn = document.getElementById(cfg.commitButtonId);
  const recenterBtn = document.getElementById(cfg.recenterButtonId);
  const statusEl = document.getElementById(cfg.statusTextId);
  if (commitBtn) commitBtn.disabled = _pendingGcj == null;
  const savedGcj = readGcjFromForm(cfg.latInputId, cfg.lngInputId);
  if (recenterBtn) recenterBtn.disabled = !savedGcj;
  if (statusEl) {
    statusEl.textContent = _pendingGcj
      ? '蓝点为候选位置，红点为当前已写入表单的坐标。点「确认选点」后蓝点消失，红点移到新位置。'
      : '红点表示已写入表单的坐标（高德 GCJ-02）。在地图另选位置会出现蓝点，须确认后才会替换红点。';
  }
}

function updateSavedMarkerPosition(cfg) {
  if (!_markerSaved || !_map) return;
  const g = readGcjFromForm(cfg.latInputId, cfg.lngInputId);
  if (!g) return;
  _markerSaved.setPosition(new window.AMap.LngLat(g.lng, g.lat));
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {boolean} [moveMap]
 */
function setPendingGcj(lat, lng, moveMap, cfg) {
  _pendingGcj = { lat, lng };
  const ll = new window.AMap.LngLat(lng, lat);
  if (_markerPending) {
    _markerPending.setPosition(ll);
    _markerPending.setMap(_map);
  }
  if (moveMap && _map) {
    _map.setZoomAndCenter(17, ll);
  }
  refreshPickUi(cfg);
}

/** 取消候选：隐藏蓝点，红点保持为当前表单坐标。 */
function clearPendingOnly(cfg) {
  _pendingGcj = null;
  if (_markerPending) _markerPending.setMap(null);
  refreshPickUi(cfg);
}

function bindPickUiOnce(cfg, toastFn) {
  if (_pickUiBound) return;
  _pickUiBound = true;

  const commitBtn = document.getElementById(cfg.commitButtonId);
  if (commitBtn) {
    commitBtn.addEventListener('click', () => {
      if (!_pendingGcj) return;
      writeGcjToForm(_pendingGcj.lat, _pendingGcj.lng, cfg.latInputId, cfg.lngInputId);
      updateSavedMarkerPosition(cfg);
      clearPendingOnly(cfg);
    });
  }

  const recenterBtn = document.getElementById(cfg.recenterButtonId);
  if (recenterBtn) {
    recenterBtn.addEventListener('click', () => {
      const g = readGcjFromForm(cfg.latInputId, cfg.lngInputId);
      if (!g || !_map) {
        toastFn('error', '请先在表单填写有效经纬度');
        return;
      }
      clearPendingOnly(cfg);
      const ll = new window.AMap.LngLat(g.lng, g.lat);
      _map.setZoomAndCenter(17, ll);
    });
  }

  let formT;
  const onFormCoordsChange = () => {
    clearTimeout(formT);
    formT = setTimeout(() => {
      if (!_map) return;
      updateSavedMarkerPosition(cfg);
      clearPendingOnly(cfg);
    }, 150);
  };
  [cfg.latInputId, cfg.lngInputId].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', onFormCoordsChange);
      el.addEventListener('change', onFormCoordsChange);
    }
  });
}

/**
 * @param {AdminSpotMapCfg} cfg
 */
export async function ensureAdminSpotMap(cfg) {
  const toastFn = typeof cfg.toast === 'function' ? cfg.toast : () => {};
  const mapEl = document.getElementById(cfg.mapContainerId);
  if (!mapEl) return false;

  const mc = window.__WEGO_MAP_CONFIG__;
  const apiKey = mc?.apiKey;
  const securityJsCode = mc?.securityJsCode;
  if (!apiKey || !securityJsCode) {
    mapEl.innerHTML =
      '<p class="text-sm text-muted" style="padding:12px;">未配置 <code>window.__WEGO_MAP_CONFIG__</code> 的 apiKey / securityJsCode，无法加载地图。可参考 <code>route-detail.html</code> 中的写法。</p>';
    return false;
  }

  bindPickUiOnce(cfg, toastFn);

  if (_map) {
    refreshPickUi(cfg);
    return true;
  }

  try {
    mapEl.innerHTML = '';
    await loadAmapBase(apiKey, securityJsCode);
    await ensurePlaceSearchPlugin();

    const initial = readGcjFromForm(cfg.latInputId, cfg.lngInputId) || DEFAULT_GCJ;

    _map = new window.AMap.Map(mapEl, {
      center: [initial.lng, initial.lat],
      zoom: 16,
      lang: 'zh_cn',
      resizeEnable: true,
    });

    _markerSaved = new window.AMap.Marker({
      position: [initial.lng, initial.lat],
      map: _map,
      content: SAVED_MARKER_HTML,
      offset: new window.AMap.Pixel(-13, -13),
      zIndex: 110,
      title: '已确认坐标（保存游玩点时转 WGS-84 入库）',
    });

    _markerPending = new window.AMap.Marker({
      position: [initial.lng, initial.lat],
      map: null,
      content: PENDING_MARKER_HTML,
      offset: new window.AMap.Pixel(-13, -13),
      zIndex: 120,
    });

    _map.on('click', (e) => {
      const ll = e.lnglat;
      setPendingGcj(ll.getLat(), ll.getLng(), false, cfg);
    });

    const runSearch = () => {
      const input = document.getElementById(cfg.searchInputId);
      const keyword = (input?.value || '').trim();
      if (!keyword) return;
      ensurePlaceSearchPlugin().then(() => {
        const ps = new window.AMap.PlaceSearch({
          pageSize: 8,
          pageIndex: 1,
          city: '全国',
          citylimit: false,
        });
        ps.search(keyword, (status, result) => {
          if (status !== 'complete' || !result?.poiList?.pois?.length) {
            toastFn('error', '未找到匹配地点，请换关键词试试');
            return;
          }
          const poi = result.poiList.pois[0];
          const loc = poi.location;
          if (!loc) return;
          const lng = loc.getLng();
          const lat = loc.getLat();
          setPendingGcj(lat, lng, true, cfg);
        });
      });
    };

    const btn = document.getElementById(cfg.searchButtonId);
    if (btn) btn.addEventListener('click', runSearch);
    const si = document.getElementById(cfg.searchInputId);
    if (si) {
      si.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          runSearch();
        }
      });
    }

    _map.on('complete', () => {
      try {
        _map.resize();
      } catch (_) { /* ignore */ }
    });
    requestAnimationFrame(() => {
      try {
        _map.resize();
      } catch (_) { /* ignore */ }
    });
    setTimeout(() => {
      try {
        _map.resize();
      } catch (_) { /* ignore */ }
    }, 350);

    clearPendingOnly(cfg);
    return true;
  } catch (err) {
    console.warn('[admin-spot-map-picker]', err);
    mapEl.innerHTML = `<p class="text-sm text-muted" style="padding:12px;">地图加载失败：${String(err.message || err)}</p>`;
    return false;
  }
}

/**
 * @param {AdminSpotMapCfg} cfg
 */
export function syncAdminSpotMapFromForm(cfg) {
  if (!_map || !_markerSaved || !_markerPending) return;
  _pendingGcj = null;
  _markerPending.setMap(null);
  const g = readGcjFromForm(cfg.latInputId, cfg.lngInputId);
  const pos = g || DEFAULT_GCJ;
  const ll = new window.AMap.LngLat(pos.lng, pos.lat);
  _markerSaved.setPosition(ll);
  _map.setZoomAndCenter(16, ll);
  try {
    _map.resize();
  } catch (_) { /* ignore */ }
  refreshPickUi(cfg);
}
