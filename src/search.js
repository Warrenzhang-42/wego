/**
 * WeGO — 路线搜索页：合并精选目录 + API，关键词过滤，支持二次搜索
 *
 * 精选目录使用静态 import：dev 时 Vite 根目录为 src/，运行时 fetch 相对路径会落到
 * /data/... 并被回退成 index.html（200 + HTML），JSON 解析失败导致精选路线丢失、搜索只剩 API 一条。
 */

import { apiClient } from './lib/api-client.js';
import {
  appendRouteCards,
  mergeFeaturedAndApiRoutes,
  filterRoutesByKeyword,
} from './lib/route-display.js';
import featuredCatalogJson from '../data/routes/featured-catalog.json';

function getQueryFromUrl() {
  return new URLSearchParams(window.location.search).get('q') || '';
}

function setHint(el, query, count, total) {
  if (!el) return;
  const q = query.trim();
  if (!q) {
    el.textContent = total ? `共 ${total} 条路线，输入关键词可缩小范围` : '暂无可展示路线';
    return;
  }
  el.textContent = count ? `「${q}」相关 ${count} 条` : `「${q}」暂无匹配`;
}

function getFeaturedCatalog() {
  return Array.isArray(featuredCatalogJson) ? featuredCatalogJson : [];
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

(async function init() {
  const form = document.getElementById('search-page-form');
  const input = document.getElementById('search-page-input');
  const bar = document.getElementById('search-page-bar');
  const container = document.getElementById('search-results');
  const emptyEl = document.getElementById('search-empty');
  const listWrap = document.getElementById('search-route-list');
  const hintEl = document.getElementById('search-result-hint');

  if (!form || !input || !container) return;

  const featured = getFeaturedCatalog();
  let apiRoutes = [];
  try {
    apiRoutes = await apiClient.getRoutes();
  } catch (e) {
    console.warn('[search] API 路线加载失败:', e.message);
  }

  const merged = mergeFeaturedAndApiRoutes(featured, apiRoutes);

  function render(query) {
    const q = (query || '').trim();
    const filtered = filterRoutesByKeyword(merged, q);
    container.innerHTML = '';
    if (filtered.length) {
      appendRouteCards(container, filtered, { listReferrerFile: 'search.html', fromParam: 'search' });
      emptyEl.hidden = true;
      listWrap.hidden = false;
    } else {
      emptyEl.hidden = false;
      listWrap.hidden = true;
    }
    setHint(hintEl, q, filtered.length, merged.length);
  }

  input.value = getQueryFromUrl();
  render(input.value);

  form.addEventListener('submit', e => {
    e.preventDefault();
    render(input.value);
    const next = new URL(window.location.href);
    const q = input.value.trim();
    if (q) next.searchParams.set('q', q);
    else next.searchParams.delete('q');
    window.history.replaceState({}, '', `${next.pathname}${next.search}`);
  });

  const debouncedRender = debounce(() => render(input.value), 320);
  input.addEventListener('input', debouncedRender);

  input.addEventListener('focus', () => {
    if (bar) bar.style.borderColor = 'var(--clr-primary)';
  });
  input.addEventListener('blur', () => {
    if (bar) bar.style.borderColor = '';
  });
})();
