/**
 * 首页轮播：从 api 解析配置，渲染与 index 既有样式一致的 DOM，并绑定滑动/自动播放。
 */
import { apiClient } from './api-client.js';
import { renderHeatDots, formatHeatNum, routeDetailUrl } from './route-display.js';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Local / 无库表时的兜底（与历史静态首屏素材一致，均为纯图） */
const DEFAULT_ITEMS = [
  { type: 'image', image_url: 'assets/hero-ai-personalized-routes.png', alt: '跟我来，AI个性化专家路线' },
  { type: 'image', image_url: 'assets/knowledge-mount-symbolism.png', alt: '轮播图' },
  { type: 'image', image_url: 'assets/knowledge-ich-1.png', alt: '轮播图' },
  { type: 'image', image_url: 'assets/knowledge-ich-2.png', alt: '轮播图' },
];

/**
 * @param {object[]} items
 * @returns {Promise<{ kind: string, payload: object }[]>}
 */
async function resolveItems(items) {
  const out = [];
  for (const it of items || []) {
    if (!it || typeof it !== 'object') continue;
    if (it.type === 'image' && it.image_url) {
      out.push({ kind: 'image', payload: { url: it.image_url, alt: it.alt || '' } });
      continue;
    }
    if (it.type === 'route' && it.route_id) {
      try {
        const route = await apiClient.getRoute(it.route_id);
        if (route && route.is_visible !== false) {
          out.push({ kind: 'route', payload: { route } });
        }
      } catch (e) {
        console.warn('[home-carousel] 跳过不可见或缺失路线:', it.route_id, e.message);
      }
    }
  }
  return out;
}

function slideHtmlImage({ url, alt }) {
  return `
    <div class="carousel-slide slide-image-only">
      <div class="slide-img-wrap">
        <img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" class="slide-img" loading="lazy" />
      </div>
    </div>`;
}

function slideHtmlRoute(route) {
  const cover = route.cover_image || 'assets/routes/yangmeizhu-heritage.png';
  const title = route.title || '精选路线';
  const desc = route.description || '';
  const heatLevel = route.heat_level ?? 3;
  const heatNum = formatHeatNum(route.heat_count);
  const durMin = route.duration_minutes;
  const hours = durMin != null ? Math.round((durMin / 60) * 10) / 10 : null;
  const metaTime = hours != null ? `🕐 ${hours}小时路线` : '🕐 路线';
  const dots = renderHeatDots(heatLevel);
  const detailHref = routeDetailUrl(route.id, 'index');

  return `
    <div class="carousel-slide">
      <div class="slide-img-wrap">
        <img src="${escapeHtml(cover)}" alt="${escapeHtml(title)}" class="slide-img" loading="lazy" />
        <div class="slide-overlay"></div>
      </div>
      <div class="slide-content">
        <h2 class="slide-title">${escapeHtml(title)}</h2>
        <p class="slide-desc">${escapeHtml(desc)}</p>
        <div class="slide-meta">
          <div class="route-heat">
            <span class="heat-label">热度</span>
            <div class="heat-dots">${dots}</div>
            <span class="heat-num">${escapeHtml(heatNum)}</span>
          </div>
          <span class="slide-meta-item">${escapeHtml(metaTime)}</span>
        </div>
        <button type="button" class="slide-cta-btn" data-carousel-route-id="${escapeHtml(route.id)}">立即体验 →</button>
      </div>
    </div>`;
}

function buildTrackHtml(resolved) {
  return resolved.map((r) => {
    if (r.kind === 'image') return slideHtmlImage(r.payload);
    if (r.kind === 'route') return slideHtmlRoute(r.payload.route);
    return '';
  }).join('');
}

function buildDots(count) {
  return Array.from({ length: count }, (_, i) =>
    `<button type="button" class="dot${i === 0 ? ' active' : ''}" data-idx="${i}" aria-label="幻灯片${i + 1}"></button>`
  ).join('');
}

function bindCarousel(track, dotsWrap) {
  const slides = () => Array.from(track.querySelectorAll('.carousel-slide'));
  const dots = () => Array.from(dotsWrap.querySelectorAll('.dot'));
  let current = 0;
  let autoTimer = null;
  let startX = 0;
  let isDragging = false;

  function goTo(idx) {
    const list = slides();
    if (!list.length) return;
    current = (idx + list.length) % list.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots().forEach((d, i) => d.classList.toggle('active', i === current));
    list.forEach((s, i) => s.classList.toggle('active', i === current));
  }

  function next() {
    goTo(current + 1);
  }

  function startAuto() {
    clearInterval(autoTimer);
    if (slides().length <= 1) return;
    autoTimer = setInterval(next, 4000);
  }

  dots().forEach((d) => {
    d.addEventListener('click', () => {
      goTo(parseInt(d.dataset.idx, 10));
      startAuto();
    });
  });

  track.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    isDragging = true;
    clearInterval(autoTimer);
  }, { passive: true });

  track.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) diff > 0 ? next() : goTo(current - 1);
    isDragging = false;
    startAuto();
  }, { passive: true });

  track.addEventListener('touchcancel', () => {
    isDragging = false;
    startAuto();
  }, { passive: true });

  function onCarouselMouseUp(e) {
    if (!isDragging) return;
    if (track.contains(e.target)) {
      const diff = startX - e.clientX;
      if (Math.abs(diff) > 40) diff > 0 ? next() : goTo(current - 1);
    }
    isDragging = false;
    startAuto();
  }
  track.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    isDragging = true;
    clearInterval(autoTimer);
  });
  document.addEventListener('mouseup', onCarouselMouseUp);

  track.querySelectorAll('.slide-cta-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-carousel-route-id');
      sessionStorage.setItem('wegoRouteDetailReferrer', 'index.html');
      window.location.href = id
        ? `route-detail.html?route=${encodeURIComponent(id)}&from=index`
        : 'route-detail.html?from=index';
    });
  });

  goTo(0);
  startAuto();
}

/**
 * @param {string} cityAdcode
 */
export async function loadAndMountHomeCarousel(cityAdcode) {
  const track = document.getElementById('carousel-track');
  const dotsWrap = document.getElementById('carousel-dots');
  if (!track || !dotsWrap) return;

  let rawItems = [];
  /** 地区模式已配置但 slides 为空时，不回落通用轮播 */
  let cityEmptyOverride = false;
  try {
    const pack = await apiClient.getHomeCarousel(cityAdcode);
    if (pack.items === null) {
      rawItems = DEFAULT_ITEMS;
    } else if (pack.mode === 'city' && Array.isArray(pack.items) && pack.items.length === 0) {
      cityEmptyOverride = true;
      rawItems = [];
    } else if (Array.isArray(pack.items) && pack.items.length > 0) {
      rawItems = pack.items;
    } else {
      rawItems = DEFAULT_ITEMS;
    }
  } catch (e) {
    console.warn('[home-carousel] 读取配置失败，使用本地兜底:', e.message);
    rawItems = DEFAULT_ITEMS;
  }

  if (cityEmptyOverride) {
    track.innerHTML =
      '<div class="carousel-slide slide-image-only"><div class="slide-img-wrap"><p style="padding:48px 24px;text-align:center;color:#999;font-size:13px;">暂无轮播内容</p></div></div>';
    dotsWrap.innerHTML = '<button type="button" class="dot active" data-idx="0" aria-label="幻灯片1"></button>';
    bindCarousel(track, dotsWrap);
    return;
  }

  const resolved = await resolveItems(rawItems);
  const useResolved = resolved.length > 0 ? resolved : [];

  if (useResolved.length === 0) {
    track.innerHTML =
      '<div class="carousel-slide slide-image-only"><div class="slide-img-wrap"><p style="padding:48px 24px;text-align:center;color:#999;font-size:13px;">暂无轮播内容</p></div></div>';
    dotsWrap.innerHTML = '<button type="button" class="dot active" data-idx="0" aria-label="幻灯片1"></button>';
    bindCarousel(track, dotsWrap);
    return;
  }

  track.innerHTML = buildTrackHtml(useResolved);
  dotsWrap.innerHTML = buildDots(useResolved.length);
  bindCarousel(track, dotsWrap);
}
