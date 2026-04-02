/**
 * WeGO — 路线卡片 DOM 渲染（首页动态列表与搜索页共用）
 */

'use strict';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRouteUuid(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

export function routeDetailUrl(routeId, fromPage) {
  const from = fromPage || 'index';
  if (isRouteUuid(routeId)) {
    return `route-detail.html?route=${encodeURIComponent(routeId)}&from=${encodeURIComponent(from)}`;
  }
  return `route-detail.html?from=${encodeURIComponent(from)}`;
}

export function renderHeatDots(heatLevel) {
  const level = Math.round(Math.min(5, Math.max(0, heatLevel || 3)));
  return Array.from({ length: 5 }, (_, i) =>
    `<span class="heat-dot${i < level ? ' hot' : ''}"></span>`
  ).join('');
}

export function formatHeatNum(num) {
  if (!num) return `${Math.floor(Math.random() * 20 + 5)}.${Math.floor(Math.random() * 9)}k`;
  return num >= 1000 ? `${(num / 1000).toFixed(1)}k` : String(num);
}

const TAG_CLASS_MAP = {
  非遗: 'tag-ich',
  手工艺: 'tag-art',
  文化: 'tag-culture',
  历史: 'tag-history',
  美食: 'tag-food',
  老字号: 'tag-history',
  徒步: 'tag-walking',
  Citywalk: 'tag-walking',
  自然: 'tag-nature',
  艺术: 'tag-art',
  咖啡: 'tag-reading',
  夜间: 'tag-night',
  探险: 'tag-adventure',
  文艺小店: 'tag-art',
  阅读文化: 'tag-culture',
  中医药: 'tag-tcm',
  胡同文化: 'tag-culture',
  独立书店: 'tag-reading',
  历史建筑: 'tag-history',
  非遗体验: 'tag-ich',
};

function tagClass(tag) {
  const plain = String(tag).replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
  return TAG_CLASS_MAP[plain] || TAG_CLASS_MAP[tag] || 'tag-culture';
}

export function buildRouteCard(route) {
  const tags = (route.tags || []).slice(0, 2);
  const tagsHtml = tags.map(t => `<span class="tag ${tagClass(t)}">${t}</span>`).join('');
  const heatLevel = route.heat_level || 3;
  const durationStr = route.duration_minutes
    ? `${Math.round((route.duration_minutes / 60) * 10) / 10}h`
    : '2h';
  const coverSrc = route.cover_image || 'assets/routes/yangmeizhu-heritage.png';
  const coverAlt = route.title || '路线封面';
  const routeId = route.id || '';

  return `
      <div class="route-card route-card--dynamic" role="button" tabindex="0"
           aria-label="路线：${route.title || ''}"
           data-route-id="${routeId}">
        <div class="route-thumb">
          <img src="${coverSrc}" alt="${coverAlt}" class="route-thumb-img" loading="lazy" />
        </div>
        <div class="route-info">
          <div class="route-title-row">
            <h3 class="route-title">${route.title || '精选路线'}</h3>
          </div>
          <p class="route-subtitle">${route.description || ''}</p>
          <div class="route-heat">
            <span class="heat-label">热度</span>
            <div class="heat-dots">${renderHeatDots(heatLevel)}</div>
            <span class="heat-num">${formatHeatNum(route.heat_count)}</span>
          </div>
          <div class="route-tags">${tagsHtml}</div>
        </div>
        <div class="route-map-thumb">
          <div class="map-mini" aria-label="${route.title || '路线'}路线示意">
            <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="64" height="64" rx="14" fill="#F4EBE8"/>
              <path d="M8 52 C 20 40, 44 24, 56 12" stroke="#b22314" stroke-width="4" stroke-linecap="round" fill="none"/>
              <circle cx="8" cy="52" r="4" fill="white" stroke="#b22314" stroke-width="2"/>
              <circle cx="56" cy="12" r="5" fill="#FF5757"/><circle cx="56" cy="12" r="2" fill="white"/>
            </svg>
            <span class="map-duration">${durationStr}</span>
          </div>
        </div>
      </div>
    `;
}

/**
 * @param {HTMLElement} container
 * @param {object[]} routes
 * @param {{ listReferrerFile?: string, fromParam?: string }} opts
 */
export function appendRouteCards(container, routes, opts = {}) {
  const listReferrerFile = opts.listReferrerFile || 'index.html';
  const fromParam = opts.fromParam || 'index';
  if (!container || !routes.length) return;
  const fragment = document.createDocumentFragment();
  routes.forEach(r => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildRouteCard(r).trim();
    const card = wrapper.firstElementChild;
    if (card) {
      fragment.appendChild(card);
      card.addEventListener('click', () => {
        card.style.transition = 'transform 0.12s';
        card.style.transform = 'scale(0.97)';
        setTimeout(() => {
          card.style.transform = '';
          sessionStorage.setItem('wegoRouteDetailReferrer', listReferrerFile);
          const rid = card.dataset.routeId || '';
          sessionStorage.setItem('wegoActiveRouteId', rid);
          window.location.href = routeDetailUrl(rid, fromParam);
        }, 150);
      });
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') card.click();
      });
    }
  });
  container.appendChild(fragment);
}

/** 合并精选目录与 API 路线；同 id 时 API 字段覆盖精选，API 未返回的键保留精选（如热度） */
export function mergeFeaturedAndApiRoutes(featuredList, apiList) {
  const map = new Map();
  (featuredList || []).forEach(r => {
    if (r && r.id) map.set(r.id, r);
  });
  (apiList || []).forEach(r => {
    if (r && r.id) {
      const prev = map.get(r.id);
      map.set(r.id, prev ? { ...prev, ...r } : r);
    }
  });
  return [...map.values()];
}

/**
 * 关键词过滤：标题、描述、标签中包含任一子串即命中（不区分大小写）
 * @param {object[]} routes
 * @param {string} rawQuery
 */
export function filterRoutesByKeyword(routes, rawQuery) {
  const q = (rawQuery || '').trim().toLowerCase();
  if (!q) return routes.slice();
  return routes.filter(route => {
    const parts = [route.title, route.description, ...(route.tags || [])]
      .filter(Boolean)
      .join('\n')
      .toLowerCase();
    if (parts.includes(q)) return true;
    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) return tokens.some(t => parts.includes(t));
    return false;
  });
}
