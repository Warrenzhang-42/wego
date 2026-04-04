/**
 * 首页城市：本地持久化、定位解析、长时间未访问时的城市不一致提示。
 * 坐标：浏览器 Geolocation 返回 WGS-84，与 admin-route-cities 边界一致。
 */

import {
  getCityMeta,
  resolveCityFromWgs84,
  ROUTE_ADMIN_PROVINCES,
} from './admin-route-cities.js';

/** @typedef {import('./admin-route-cities.js').AdminCity} AdminCity */

export const DEFAULT_CITY_ADCODE = '110000';

/** 视为「长时间未访问」的间隔（默认 7 天） */
export const STALE_VISIT_MS = 7 * 24 * 60 * 60 * 1000;

/** 用户点「保持当前城市」后，同一路径下不再弹窗的最小间隔 */
export const MISMATCH_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

const LS = {
  adcode: 'wego_selected_city_adcode',
  district: 'wego_selected_district_name',
  history: 'wego_city_visit_history_v1',
  lastVisit: 'wego_last_visit_at',
  locPerm: 'wego_location_permission_state',
  snooze: 'wego_city_mismatch_snooze',
};

/**
 * @returns {string | null} 用户已持久化选择的城市；从未写入则为 null（首访）。
 */
export function getStoredAdcodeRaw() {
  try {
    const v = localStorage.getItem(LS.adcode);
    if (v && /^[0-9]{6}$/.test(v)) return v;
  } catch (_) {}
  return null;
}

/**
 * 业务默认城市（列表筛选等兜底，首访定位完成后应与持久化一致）。
 * @returns {string}
 */
export function getSelectedAdcode() {
  return getStoredAdcodeRaw() ?? DEFAULT_CITY_ADCODE;
}

/**
 * @returns {string} 已选区县名（如「密云区」），无则为空串
 */
export function getStoredDistrictName() {
  try {
    const v = localStorage.getItem(LS.district);
    return v && String(v).trim() ? String(v).trim() : '';
  } catch (_) {
    return '';
  }
}

/**
 * @param {string} [name]
 */
export function setStoredDistrictName(name) {
  try {
    if (!name || !String(name).trim()) localStorage.removeItem(LS.district);
    else localStorage.setItem(LS.district, String(name).trim());
  } catch (_) {}
}

/**
 * @returns {{ adcode: string, district: string, ts?: number }[]}
 */
export function getCityVisitHistory() {
  try {
    const raw = localStorage.getItem(LS.history);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

/**
 * @param {string} adcode
 * @param {string} [districtName]
 */
function pushCityVisitHistory(adcode, districtName) {
  try {
    let arr = getCityVisitHistory();
    const d = districtName ? String(districtName).trim() : '';
    const key = `${adcode}|${d}`;
    arr = arr.filter(x => `${x.adcode}|${x.district || ''}` !== key);
    arr.unshift({ adcode, district: d, ts: Date.now() });
    localStorage.setItem(LS.history, JSON.stringify(arr.slice(0, 8)));
  } catch (_) {}
}

/**
 * @param {string} adcode
 * @param {{ labelEl?: HTMLElement | null }} [ui]
 */
export function setSelectedAdcode(adcode, ui) {
  if (!/^[0-9]{6}$/.test(String(adcode))) return;
  try {
    localStorage.setItem(LS.adcode, String(adcode));
  } catch (_) {}
  applyLabelToUi(adcode, ui);
}

/**
 * @param {string} adcode
 * @param {{ labelEl?: HTMLElement | null }} [ui]
 */
export function applyLabelToUi(adcode, ui) {
  const el = ui?.labelEl ?? document.querySelector('.location-text');
  if (!el) return;
  const meta = getCityMeta(adcode);
  if (!meta) {
    el.textContent = '选择城市';
    return;
  }
  const dist = getStoredDistrictName();
  const cityShort = meta.name
    .replace(/特别行政区$/, '')
    .replace(/市$/, '');
  if (dist) {
    el.textContent = `${cityShort} · ${dist}`;
  } else {
    el.textContent = `${meta.provinceName}，${meta.name}`;
  }
}

/**
 * @param {number | null} t
 */
function readSnooze(t) {
  try {
    const raw = localStorage.getItem(LS.snooze);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o.until !== 'number' || !o.saved_adcode || !o.detected_adcode) return null;
    if (t != null && o.until > t) return o;
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * @param {{ saved_adcode: string, detected_adcode: string }} pair
 */
function writeSnooze(pair) {
  try {
    localStorage.setItem(
      LS.snooze,
      JSON.stringify({
        until: Date.now() + MISMATCH_SNOOZE_MS,
        saved_adcode: pair.saved_adcode,
        detected_adcode: pair.detected_adcode,
      })
    );
  } catch (_) {}
}

function clearSnooze() {
  try {
    localStorage.removeItem(LS.snooze);
  } catch (_) {}
}

/**
 * @returns {Promise<{ lat: number, lng: number } | null>}
 */
function getCurrentPositionWgs84() {
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 120000, timeout: 12000 }
    );
  });
}

/**
 * @param {string} state
 */
function setLocPermState(state) {
  try {
    localStorage.setItem(LS.locPerm, state);
  } catch (_) {}
}

/**
 * 打开城市不一致确认层（由页面提供 DOM）。
 * @param {{
 *   detectedLabel: string,
 *   savedLabel: string,
 *   onSwitch: () => void,
 *   onKeep: () => void,
 * }} opts
 */
function openCityMismatchSheet(opts) {
  const backdrop = document.getElementById('city-mismatch-backdrop');
  const title = document.getElementById('city-mismatch-title');
  const body = document.getElementById('city-mismatch-body');
  const btnSwitch = document.getElementById('city-mismatch-switch');
  const btnKeep = document.getElementById('city-mismatch-keep');
  if (!backdrop || !btnSwitch || !btnKeep) return;

  if (title) {
    title.textContent = '是否切换城市？';
  }
  if (body) {
    body.textContent = `检测到您当前位置在「${opts.detectedLabel}」，与已选城市「${opts.savedLabel}」不同。是否切换为当前定位城市以浏览当地路线？`;
  }

  backdrop.hidden = false;
  backdrop.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  let cleaned = false;
  const close = () => {
    if (cleaned) return;
    cleaned = true;
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    btnSwitch.removeEventListener('click', onSwitchClick);
    btnKeep.removeEventListener('click', onKeepClick);
    backdrop.removeEventListener('click', onBackdropClick);
    document.removeEventListener('keydown', onKey);
  };

  function onSwitchClick() {
    opts.onSwitch();
    close();
  }
  function onKeepClick() {
    opts.onKeep();
    close();
  }
  function onBackdropClick(e) {
    if (e.target === backdrop) {
      opts.onKeep();
      close();
    }
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      opts.onKeep();
      close();
    }
  }

  btnSwitch.addEventListener('click', onSwitchClick);
  btnKeep.addEventListener('click', onKeepClick);
  backdrop.addEventListener('click', onBackdropClick);
  document.addEventListener('keydown', onKey);

  setTimeout(() => btnSwitch.focus(), 50);
}

/**
 * 首页入口：绑定导航、写回访问时间、处理定位与「长时间未访问」弹窗。
 */
export async function initHomeCity() {
  const navBtn = document.getElementById('btn-city-picker');
  const labelEl = document.querySelector('.location-text');
  const ui = { labelEl };

  const previousVisit = (() => {
    try {
      const v = localStorage.getItem(LS.lastVisit);
      if (!v) return null;
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : null;
    } catch (_) {
      return null;
    }
  })();

  if (getStoredAdcodeRaw()) {
    applyLabelToUi(getSelectedAdcode(), ui);
  }

  if (navBtn) {
    navBtn.addEventListener('click', () => {
      sessionStorage.setItem('wego_city_select_return', 'index.html');
      window.location.href = 'city-select.html';
    });
  }

  const pos = await getCurrentPositionWgs84();
  if (pos) {
    setLocPermState('granted');
  } else {
    setLocPermState(
      navigator.geolocation ? 'denied' : 'unsupported'
    );
  }

  const detected = pos ? resolveCityFromWgs84(pos.lat, pos.lng) : null;

  if (!getStoredAdcodeRaw()) {
    setStoredDistrictName('');
    if (detected) {
      setSelectedAdcode(detected.adcode, ui);
    } else {
      setSelectedAdcode(DEFAULT_CITY_ADCODE, ui);
    }
  }

  const now = Date.now();
  const stale =
    previousVisit != null && now - previousVisit >= STALE_VISIT_MS;

  const currentSaved = getStoredAdcodeRaw() ?? DEFAULT_CITY_ADCODE;
  const detectedMeta = detected ? getCityMeta(detected.adcode) : null;
  const savedMeta = getCityMeta(currentSaved);

  if (
    stale &&
    detected &&
    detectedMeta &&
    savedMeta &&
    detected.adcode !== currentSaved
  ) {
    const snooze = readSnooze(now);
    const snoozeActive =
      snooze &&
      snooze.saved_adcode === currentSaved &&
      snooze.detected_adcode === detected.adcode;

    if (!snoozeActive) {
      const detectedLabel = `${detectedMeta.provinceName} · ${detectedMeta.name}`;
      const savedLabel = `${savedMeta.provinceName} · ${savedMeta.name}`;
      openCityMismatchSheet({
        detectedLabel,
        savedLabel,
        onSwitch: () => {
          clearSnooze();
          setStoredDistrictName('');
          setSelectedAdcode(detected.adcode, ui);
          window.location.reload();
        },
        onKeep: () => {
          writeSnooze({
            saved_adcode: currentSaved,
            detected_adcode: detected.adcode,
          });
        },
      });
    }
  }

  // 离开页面后再回来才重新计时：本次会话结束写入
  try {
    localStorage.setItem(LS.lastVisit, String(now));
  } catch (_) {}

  window.addEventListener(
    'pagehide',
    () => {
      try {
        localStorage.setItem(LS.lastVisit, String(Date.now()));
      } catch (_) {}
    },
    { once: false }
  );
}

/**
 * 城市选择页：写入城市与可选区县，并记录访问历史。
 * @param {string} adcode
 * @param {string} [districtName] 如「密云区」，仅展示；仍用 adcode 作业务城市键
 */
export function saveCityFromPicker(adcode, districtName) {
  if (!/^[0-9]{6}$/.test(String(adcode))) return;
  const d = districtName ? String(districtName).trim() : '';
  setStoredDistrictName(d);
  try {
    localStorage.setItem(LS.adcode, String(adcode));
  } catch (_) {}
  applyLabelToUi(adcode);
  pushCityVisitHistory(adcode, d);
  try {
    localStorage.setItem(LS.lastVisit, String(Date.now()));
  } catch (_) {}
}

export { ROUTE_ADMIN_PROVINCES };
