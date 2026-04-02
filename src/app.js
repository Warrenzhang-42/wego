/* ====================================================
   WeGO · app.js — Mobile Homepage Interactions
   ==================================================== */

import { appendRouteCards } from './lib/route-display.js';

// ---- Sprint 8: 数据库驱动路线列表 ----------------------
(async function initDynamicRoutes() {
  'use strict';

  // 渲染动态路线（追加到 local tab）
  try {
    const { apiClient } = await import('./lib/api-client.js');
    const routes = await apiClient.getRoutes();

    // 将数据库路线追加到"本地"tab（不替换现有硬编码卡片）
    const localTab = document.getElementById('tab-content-local');
    if (localTab && routes.length) {
      // 加一个分割线标题
      const divider = document.createElement('p');
      divider.className = 'route-group-hint';
      divider.textContent = '— 更多路线 —';
      Object.assign(divider.style, {
        textAlign: 'center', fontSize: '12px', color: '#999',
        margin: '4px 0 8px', fontWeight: '600'
      });
      localTab.appendChild(divider);
      appendRouteCards(localTab, routes, { listReferrerFile: 'index.html', fromParam: 'index' });
    }

    // ── Chip Tag 过滤（Sprint 8.3）──────────────────────
    const allChips = document.querySelectorAll('.chip');
    const chipTagMap = {
      local:     null,        // 显示全部（硬编码 + 数据库）
      recommend: null,        // 显示推荐 tab
      food:      '美食',
      culture:   '文化',
      nature:    '自然',
    };

    // 注意：此函数覆盖了 initChips() 的 tab 切换行为，因此需在此处统一管理
    allChips.forEach(chip => {
      chip.addEventListener('click', async () => {
        allChips.forEach(c => { c.classList.remove('active'); c.setAttribute('aria-selected', 'false'); });
        chip.classList.add('active');
        chip.setAttribute('aria-selected', 'true');
        chip.style.transform = 'scale(0.93)';
        setTimeout(() => { chip.style.transform = ''; }, 160);

        const tabId  = chip.dataset.tab;
        const tagFilter = chipTagMap[tabId];

        // 固定 tab 切换
        document.querySelectorAll('.route-group').forEach(g => { g.style.display = 'none'; });
        const target = document.getElementById('tab-content-' + tabId);
        if (target) {
          target.style.display = 'block';
        } else if (tabId !== 'local' && tabId !== 'recommend') {
          // 动态标签页：展示数据库过滤结果
          const localTabEl = document.getElementById('tab-content-local');
          if (localTabEl) {
            localTabEl.style.display = 'block';

            // 临时清除: 隐藏"本地"硬编码卡片，只显示过滤结果
            const staticCards = localTabEl.querySelectorAll('.route-card:not(.route-card--dynamic)');
            staticCards.forEach(c => { c.style.display = tagFilter ? 'none' : ''; });

            // 过滤动态卡片
            const dynamicCards = localTabEl.querySelectorAll('.route-card--dynamic');
            if (tagFilter) {
              try {
                const filtered = await apiClient.getRoutes({ tag: tagFilter });
                const filteredIds = new Set(filtered.map(r => r.id));
                dynamicCards.forEach(card => {
                  card.style.display = filteredIds.has(card.dataset.routeId) ? '' : 'none';
                });
              } catch {
                dynamicCards.forEach(c => { c.style.display = ''; });
              }
            } else {
              dynamicCards.forEach(c => { c.style.display = ''; });
            }
          }
        } else if (tabId === 'local') {
          // 恢复本地 tab 显示所有卡片
          const localTabEl = document.getElementById('tab-content-local');
          if (localTabEl) {
            localTabEl.querySelectorAll('.route-card').forEach(c => { c.style.display = ''; });
          }
        }
      });
    });

  } catch (err) {
    console.warn('[app.js] 动态路线加载失败（可能是本地模式/无 JSON 文件）:', err.message);
  }
})();

// ---- Carousel ----------------------------------------
(function initCarousel() {
  const track   = document.getElementById('carousel-track');
  const dots    = document.querySelectorAll('.carousel-dots .dot');
  const slides  = document.querySelectorAll('.carousel-slide');
  let current   = 0;
  let autoTimer = null;
  let startX    = 0;
  let isDragging = false;

  function goTo(idx) {
    current = (idx + slides.length) % slides.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
    // Trigger subtle zoom on active slide
    slides.forEach((s, i) => s.classList.toggle('active', i === current));
  }

  function next() { goTo(current + 1); }

  function startAuto() {
    clearInterval(autoTimer);
    autoTimer = setInterval(next, 4000);
  }

  // Dot click
  dots.forEach(d => {
    d.addEventListener('click', () => {
      goTo(parseInt(d.dataset.idx, 10));
      startAuto();
    });
  });

  // Swipe support
  track.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    isDragging = true;
    clearInterval(autoTimer);
  }, { passive: true });

  track.addEventListener('touchend', e => {
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

  // Mouse drag（桌面）：必须在 document 上结束拖拽，否则在轨道外松开鼠标时 isDragging
  // 无法复位，可能干扰后续交互；滑动判断仍以起点在轮轨内为准。
  function onCarouselMouseUp(e) {
    if (!isDragging) return;
    if (track.contains(e.target)) {
      const diff = startX - e.clientX;
      if (Math.abs(diff) > 40) diff > 0 ? next() : goTo(current - 1);
    }
    isDragging = false;
    startAuto();
  }
  track.addEventListener('mousedown', e => {
    startX = e.clientX;
    isDragging = true;
    clearInterval(autoTimer);
  });
  document.addEventListener('mouseup', onCarouselMouseUp);

  // CTA click
  document.querySelectorAll('.slide-cta-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      sessionStorage.setItem('wegoRouteDetailReferrer', 'index.html');
      window.location.href = 'route-detail.html?from=index';
    });
  });

  goTo(0);
  startAuto();
})();




// ---- Category Chips 已由 Sprint 8 initDynamicRoutes() 统一管理 ----


// ---- Bottom Nav--------------------------------------
(function initBottomNav() {
  const items = document.querySelectorAll('.bottom-nav-item');
  const navContainer = document.getElementById('bottom-nav');
  items.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.dataset.nav;
      if (tabId === 'destinations') {
        window.location.href = 'my-destinations.html';
        return;
      }
      items.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      navContainer.classList.remove('tab-destinations');
      navContainer.classList.add('tab-explore');
    });
  });
})();


// ---- Route Cards: ripple tap effect & navigation ----
(function initRouteCards() {
  const cards = document.querySelectorAll('.route-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      card.style.transition = 'transform 0.12s';
      card.style.transform  = 'scale(0.97)';
      
      // Navigate after a short delay to let the ripple effect be seen
      setTimeout(() => {
        card.style.transform = '';
        sessionStorage.setItem('wegoRouteDetailReferrer', 'index.html');
        window.location.href = 'route-detail.html?from=index';
      }, 150);
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') card.click();
    });
  });
})();





// ---- Search bar：跳转搜索页 --------------------------------
(function initHomeSearch() {
  const searchBar = document.getElementById('search-bar');
  const searchInput = document.getElementById('search-input');
  const form = document.getElementById('home-search-form');
  if (!searchInput || !searchBar) return;

  function goSearch() {
    const q = searchInput.value.trim();
    const url = q ? `search.html?q=${encodeURIComponent(q)}` : 'search.html';
    window.location.href = url;
  }

  searchInput.addEventListener('focus', () => {
    searchBar.style.borderColor = 'var(--clr-primary)';
  });
  searchInput.addEventListener('blur', () => {
    searchBar.style.borderColor = '';
  });

  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      goSearch();
    });
  }

})();

const btnSeeAll = document.getElementById('btn-see-all');
if (btnSeeAll) {
  btnSeeAll.addEventListener('click', () => {
    window.location.href = 'search.html';
  });
}


// ---- Toast utility -----------------------------------
function showToast(msg) {
  const existing = document.querySelector('.wego-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'wego-toast';
  toast.textContent = msg;
  Object.assign(toast.style, {
    position:     'fixed',
    bottom:       '90px',
    left:         '50%',
    transform:    'translateX(-50%) translateY(20px)',
    background:   'rgba(26,35,50,0.92)',
    color:        'white',
    padding:      '10px 20px',
    borderRadius: '24px',
    fontSize:     '13px',
    fontWeight:   '700',
    fontFamily:   "'Manrope', sans-serif",
    whiteSpace:   'nowrap',
    zIndex:       '9999',
    boxShadow:    '0 4px 20px rgba(0,0,0,0.25)',
    transition:   'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
    opacity:      '0',
    maxWidth:     '360px',
    textAlign:    'center',
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity   = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateX(-50%) translateY(10px)';
    setTimeout(() => toast.remove(), 350);
  }, 2800);
}


