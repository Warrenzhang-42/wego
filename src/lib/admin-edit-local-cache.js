/**
 * 管理后台 · 路线 / 游玩点编辑的浏览器本地草稿缓存（localStorage）
 * 用于误关弹窗、刷新页、网络异常时恢复未提交的表单内容。
 */

const NS = 'wego.admin.localDraft.v1';

export function routeLocalDraftKey(routeId) {
  return `${NS}:route:${routeId}`;
}

export function spotLocalDraftKey(routeId, spotId) {
  return `${NS}:spot:${routeId}:${spotId}`;
}

/**
 * @param {string} key
 * @param {Record<string, unknown>} payload
 * @returns {boolean}
 */
export function saveLocalDraft(key, payload) {
  try {
    const rec = { savedAt: Date.now(), v: 1, payload };
    localStorage.setItem(key, JSON.stringify(rec));
    return true;
  } catch (e) {
    console.warn('[WeGO admin local draft]', e);
    return false;
  }
}

/**
 * @param {string} key
 * @returns {{ savedAt: number, payload: Record<string, unknown> } | null}
 */
export function loadLocalDraft(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (!rec || typeof rec !== 'object' || !rec.payload) return null;
    return rec;
  } catch {
    return null;
  }
}

/** @param {string} key */
export function clearLocalDraft(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** 删除某游玩点可能存在的本地缓存（删除景点时调用；key 含 routeId:spotId） */
export function clearSpotLocalDraftsForSpotId(spotId) {
  const suffix = `:${spotId}`;
  const prefix = `${NS}:spot:`;
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix) && k.endsWith(suffix)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
