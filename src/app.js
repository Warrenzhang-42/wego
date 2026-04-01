/* ====================================================
   WeGO · app.js — Mobile Homepage Interactions
   ==================================================== */

// ---- Sprint 8: 数据库驱动路线列表 ----------------------
(async function initDynamicRoutes() {
  'use strict';

  // 简单热度渲染辅助（0-5 颗点）
  function renderHeatDots(heatLevel) {
    const level = Math.round(Math.min(5, Math.max(0, heatLevel || 3)));
    return Array.from({ length: 5 }, (_, i) =>
      `<span class="heat-dot${i < level ? ' hot' : ''}"></span>`
    ).join('');
  }

  // 热度数字格式化
  function formatHeatNum(num) {
    if (!num) return `${Math.floor(Math.random() * 20 + 5)}.${Math.floor(Math.random() * 9)}k`;
    return num >= 1000 ? `${(num / 1000).toFixed(1)}k` : String(num);
  }

  // Tag 类型映射
  const TAG_CLASS_MAP = {
    '非遗': 'tag-ich', '手工艺': 'tag-art', '文化': 'tag-culture', '历史': 'tag-history',
    '美食': 'tag-food', '老字号': 'tag-history', '徒步': 'tag-walking', 'Citywalk': 'tag-walking',
    '自然': 'tag-nature', '艺术': 'tag-art', '咖啡': 'tag-reading'
  };
  function tagClass(tag) { return TAG_CLASS_MAP[tag] || 'tag-culture'; }

  // 将路线数据渲染为 route-card HTML
  function buildRouteCard(route) {
    const tags = (route.tags || []).slice(0, 2);
    const tagsHtml = tags.map(t => `<span class="tag ${tagClass(t)}">${t}</span>`).join('');
    const heatLevel = route.heat_level || 3;
    const durationStr = route.duration_minutes
      ? `${Math.round(route.duration_minutes / 60 * 10) / 10}h`
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

  // 平滑插入（避免页面跳动）
  function appendRouteCards(container, routes) {
    if (!container || !routes.length) return;
    const fragment = document.createDocumentFragment();
    routes.forEach(r => {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = buildRouteCard(r).trim();
      const card = wrapper.firstElementChild;
      if (card) {
        fragment.appendChild(card);
        // 绑定点击
        card.addEventListener('click', () => {
          card.style.transition = 'transform 0.12s';
          card.style.transform  = 'scale(0.97)';
          setTimeout(() => {
            card.style.transform = '';
            sessionStorage.setItem('wegoRouteDetailReferrer', 'index.html');
            sessionStorage.setItem('wegoActiveRouteId', card.dataset.routeId || '');
            window.location.href = 'route-detail.html?from=index';
          }, 150);
        });
      }
    });
    container.appendChild(fragment);
  }

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
      appendRouteCards(localTab, routes);
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

  // Mouse drag (desktop preview)
  track.addEventListener('mousedown', e => { startX = e.clientX; isDragging = true; clearInterval(autoTimer); });
  track.addEventListener('mouseup',   e => {
    if (!isDragging) return;
    const diff = startX - e.clientX;
    if (Math.abs(diff) > 40) diff > 0 ? next() : goTo(current - 1);
    isDragging = false;
    startAuto();
  });

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





// ---- Search bar click --------------------------------
document.getElementById('search-input').addEventListener('focus', () => {
  document.getElementById('search-bar').style.borderColor = 'var(--clr-primary)';
});
document.getElementById('search-input').addEventListener('blur', () => {
  document.getElementById('search-bar').style.borderColor = '';
});


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


