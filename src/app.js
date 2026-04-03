/* ====================================================
   WeGO · app.js — Mobile Homepage Interactions
   ==================================================== */

import { appendRouteCards } from './lib/route-display.js';

// ---- Sprint 8: 数据库驱动路线列表 ----------------------
(async function initDynamicRoutes() {
  'use strict';
  const LOCAL_PAGE_SIZE = 10;

  // 渲染动态路线（追加到 local tab）
  try {
    const { apiClient } = await import('./lib/api-client.js');
    const routes = await apiClient.getRoutes();

    const localTab = document.getElementById('tab-content-local');
    let currentFilterTag = null;
    let localCardsForPagination = [];
    let localCurrentPage = 0;

    // 本地 tab 仅展示数据库路线，避免与静态卡片叠加导致数量异常
    if (localTab) {
      localTab.innerHTML = '';
      if (routes.length) {
        appendRouteCards(localTab, routes, { listReferrerFile: 'index.html', fromParam: 'index' });
      }

      const localSentinel = document.createElement('p');
      localSentinel.className = 'route-pagination-sentinel';
      Object.assign(localSentinel.style, {
        textAlign: 'center',
        fontSize: '12px',
        color: '#999',
        margin: '6px 0 12px',
        fontWeight: '600',
      });
      localTab.appendChild(localSentinel);

      const allLocalCards = () => Array.from(localTab.querySelectorAll('.route-card'));
      const resolveCardsByTag = (tagFilter) => {
        const cards = allLocalCards();
        if (!tagFilter) return cards;
        return cards.filter(card => {
          const tags = Array.from(card.querySelectorAll('.route-tags .tag'))
            .map(tag => (tag.textContent || '').trim());
          return tags.some(tag => tag.includes(tagFilter));
        });
      };
      const renderNextPage = () => {
        const start = localCurrentPage * LOCAL_PAGE_SIZE;
        if (start >= localCardsForPagination.length) {
          localSentinel.textContent = localCardsForPagination.length ? '已展示全部路线' : '暂无匹配路线';
          return;
        }
        const nextCards = localCardsForPagination.slice(start, start + LOCAL_PAGE_SIZE);
        nextCards.forEach(card => { card.style.display = ''; });
        localCurrentPage += 1;
        localSentinel.textContent =
          localCurrentPage * LOCAL_PAGE_SIZE < localCardsForPagination.length
            ? '下拉加载更多路线'
            : '已展示全部路线';
      };
      const resetPagination = (tagFilter = null) => {
        currentFilterTag = tagFilter;
        localCurrentPage = 0;
        localCardsForPagination = resolveCardsByTag(tagFilter);
        allLocalCards().forEach(card => { card.style.display = 'none'; });
        renderNextPage();
      };

      const observer = new IntersectionObserver(entries => {
        const [entry] = entries;
        const isLocalVisible = localTab.style.display !== 'none';
        if (!entry?.isIntersecting || !isLocalVisible) return;
        renderNextPage();
      }, { root: null, threshold: 0.1 });
      observer.observe(localSentinel);

      resetPagination(null);
    }

    // ── Chip Tag 过滤（Sprint 8.3：调用 apiClient.getRoutes({ tag }) 动态拉取）──
    const allChips = document.querySelectorAll('.chip');
    const chipTagMap = {
      local:     null,        // 显示全部（从数据库重新拉取）
      recommend: null,         // 显示推荐 tab
      food:      '美食',
      culture:   '文化',
      nature:    '自然',
    };
    const localTabEl = document.getElementById('tab-content-local');
    const recommendTabEl = document.getElementById('tab-content-recommend');
    const localSentinelEl = localTabEl?.querySelector('.route-pagination-sentinel') || null;

    // 按标签从数据库动态拉取路线，重新渲染 local tab
    async function reloadLocalRoutes(tag) {
      if (!localTabEl) return;
      try {
        const routes = await apiClient.getRoutes(tag ? { tag } : {});
        localTabEl.innerHTML = '';
        if (routes.length) {
          appendRouteCards(localTabEl, routes, { listReferrerFile: 'index.html', fromParam: 'index' });
        } else {
          localTabEl.innerHTML = `<p style="text-align:center;color:#999;font-size:13px;padding:20px 0;">暂无「${tag || ''}」相关路线</p>`;
        }

        // 重新追加分页 sentinel
        const sentinel = document.createElement('p');
        sentinel.className = 'route-pagination-sentinel';
        Object.assign(sentinel.style, {
          textAlign: 'center', fontSize: '12px', color: '#999',
          margin: '6px 0 12px', fontWeight: '600',
        });
        sentinel.textContent = routes.length ? '下拉加载更多路线' : '暂无更多路线';
        localTabEl.appendChild(sentinel);

        // 重新绑定卡片点击
        localTabEl.querySelectorAll('.route-card').forEach(card => {
          card.addEventListener('click', () => {
            card.style.transition = 'transform 0.12s';
            card.style.transform = 'scale(0.97)';
            setTimeout(() => {
              card.style.transform = '';
              sessionStorage.setItem('wegoRouteDetailReferrer', 'index.html');
              window.location.href = 'route-detail.html?from=index';
            }, 150);
          });
        });

        // 重新观察分页
        localPaginate.currentPage = 0;
        localPaginate.allCards = () => Array.from(localTabEl.querySelectorAll('.route-card'));
        if (routes.length > 0) {
          localPaginate.allCards().forEach(c => { c.style.display = 'none'; });
          renderNextPage();
        }
        localPaginate.sentinel = sentinel;
        localPaginate.observer?.disconnect();
        localPaginate.observer = new IntersectionObserver(entries => {
          const [entry] = entries;
          if (!entry?.isIntersecting || localTabEl.style.display === 'none') return;
          renderNextPage();
        }, { root: null, threshold: 0.1 });
        localPaginate.observer.observe(sentinel);
      } catch (e) {
        console.warn('[app.js] 按标签拉取路线失败:', e);
      }
    }

    // ── 分页状态（供 reloadLocalRoutes 引用）────────────────
    let localPaginate = {
      currentPage: 0,
      allCards: () => Array.from((localTabEl || {}).querySelectorAll('.route-card') || []),
      sentinel: localSentinelEl,
      observer: null,
    };
    const LOCAL_PAGE_SIZE = 10;

    function renderNextPage() {
      const { currentPage, allCards, sentinel } = localPaginate;
      const cards = allCards();
      const start = currentPage * LOCAL_PAGE_SIZE;
      if (start >= cards.length) {
        if (sentinel) sentinel.textContent = cards.length ? '已展示全部路线' : '暂无路线';
        return;
      }
      cards.slice(start, start + LOCAL_PAGE_SIZE).forEach(c => { c.style.display = ''; });
      localPaginate.currentPage += 1;
      if (sentinel) {
        sentinel.textContent =
          localPaginate.currentPage * LOCAL_PAGE_SIZE < cards.length
            ? '下拉加载更多路线'
            : '已展示全部路线';
      }
    }

    // ── Chip 点击处理 ────────────────────────────────────────
    allChips.forEach(chip => {
      chip.addEventListener('click', async () => {
        allChips.forEach(c => { c.classList.remove('active'); c.setAttribute('aria-selected', 'false'); });
        chip.classList.add('active');
        chip.setAttribute('aria-selected', 'true');
        chip.style.transform = 'scale(0.93)';
        setTimeout(() => { chip.style.transform = ''; }, 160);

        const tabId = chip.dataset.tab;
        const tagFilter = chipTagMap[tabId];

        // 隐藏所有 tab
        document.querySelectorAll('.route-group').forEach(g => { g.style.display = 'none'; });

        if (tabId === 'local') {
          // 重新拉取全部路线
          if (localTabEl) {
            localTabEl.style.display = '';
            await reloadLocalRoutes(null);
          }
        } else if (tabId === 'recommend') {
          // 推荐 tab：直接显示
          if (recommendTabEl) recommendTabEl.style.display = '';
        } else if (tagFilter) {
          // 标签过滤：从数据库按标签拉取，重新渲染 local tab
          if (localTabEl) {
            localTabEl.style.display = '';
            await reloadLocalRoutes(tagFilter);
          }
          if (localSentinelEl) localSentinelEl.style.display = 'none';
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


