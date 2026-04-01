/* ====================================================
   WeGO — Route Detail Page · route-detail.js
   Sprint 1.7：接入高德地图适配器，从 dashilan.json 读取路线数据
   ==================================================== */

import { MapAdapterFactory } from './lib/map-adapter.js';

(function () {
  'use strict';

  /* ---- 地图适配器实例 --------------------------------- */
  let mapAdapter = null;

  /* ---- Elements ----------------------------------- */
  const app            = document.getElementById('app');
  const detailPanel    = document.getElementById('rd-detail-panel');
  const fullscreenBtn  = document.getElementById('rd-fullscreen-btn');
  const spotList       = document.getElementById('rd-spot-list');
  const fsOverlay      = document.getElementById('rd-fullscreen-overlay');
  const fsFsCloseBtn   = document.getElementById('rd-fs-close-btn');
  const mapContainer   = document.getElementById('rd-map-container');
  const mapFallbackImg = document.querySelector('.rd-map-fallback');

  // 返回按钮
  document.getElementById('rd-back-btn').addEventListener('click', (e) => {
    e.preventDefault();
    window.location.replace('index.html');
  });

  /* ---- 从 data/routes/dashilan.json 加载路线数据 ------- */
  async function loadRouteData() {
    try {
      const resp = await fetch('../data/routes/dashilan.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      console.error('[route-detail] 路线数据加载失败，使用内嵌备份数据:', err);
      return null;
    }
  }

  /* ---- 初始化地图 (多引擎驱动) ------------------------ */
  async function initMap(spots) {
    const config = window.__WEGO_MAP_CONFIG__ || {};
    const provider = config.provider || 'amap';

    // 检查是否有足够的配置进行初始化
    if (!config.apiKey) {
      console.warn(`[route-detail] 未配置 ${provider} API Key，跳过地图初始化，使用静态图降级`);
      if (mapFallbackImg) mapFallbackImg.style.display = 'block';
      if (mapContainer) mapContainer.style.display = 'none';
      return;
    }

    try {
      // 使用工厂类创建适配器
      mapAdapter = MapAdapterFactory.create(provider, mapContainer, {
        apiKey:         config.apiKey,
        securityJsCode: config.securityJsCode,
        mapOptions: {
          zoom: 17
        }
      });

      await mapAdapter.init();

      // 1. 添加各景点标记
      spots.forEach((spot, idx) => {
        mapAdapter.addMarker(spot.lng, spot.lat, {
          index:   idx,
          label:   (idx + 1).toString(), // 序号数字
          title:   spot.name,            // 景点名标签
          onClick: () => {
            const card = document.getElementById(`spot-card-${idx}`);
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // 如果是在手机端，确保卡片也被高亮等逻辑...
          },
        });
      });

      // 2. 绘制路线
      const coords = spots.map(s => ({ lat: s.lat, lng: s.lng }));
      await mapAdapter.drawRoute(coords);

      // 3. 视野对齐
      const lats = spots.map(s => s.lat);
      const lngs = spots.map(s => s.lng);
      mapAdapter.fitBounds({
        sw: { lat: Math.min(...lats) - 0.001, lng: Math.min(...lngs) - 0.001 },
        ne: { lat: Math.max(...lats) + 0.001, lng: Math.max(...lngs) + 0.001 },
      });

      console.log(`[route-detail] ✅ ${provider} 地图初始化完成`);

    } catch (err) {
      console.error(`[route-detail] ${provider} 地图初始化失败，使用静态图降级:`, err);
      if (mapFallbackImg) mapFallbackImg.style.display = 'block';
      if (mapContainer) mapContainer.style.display = 'none';
    }
  }

  /* ---- 导出切换引擎方法 ---------------------------- */
  window.switchMapEngine = async (provider) => {
    if (!mapAdapter || !currentSpots) return;
    
    console.log(`[route-detail] 正在切换引擎记录为: ${provider}`);
    
    // 1. 销毁旧实例
    mapAdapter.destroy();
    mapContainer.innerHTML = ''; // 清空容器
    
    // 2. 更新配置并重新初始化
    window.__WEGO_MAP_CONFIG__.provider = provider;
    await initMap(currentSpots);
  };

  // 全局变量保存当前景点数据以供切换使用
  let currentSpots = [];

  /* ---- Fullscreen --------------------------------- */
  function openFullscreen() {
    const fsContainer = fsOverlay.querySelector('.rd-fs-map-container');
    fsContainer.innerHTML = '';
    const img = document.createElement('img');
    img.src = 'assets/maps/dashilan-base-map.png';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.style.cssText =
      'width:100%;height:100%;object-fit:cover;object-position:center;background:#e4e2e3;display:block;';
    fsContainer.appendChild(img);

    fsOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeFullscreen() {
    fsOverlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  const togglePanelFullscreen = (e) => {
    e.stopPropagation();
    const expanded = app.classList.toggle('rd-map-expanded');
    detailPanel.classList.toggle('is-collapsed', expanded);
    if (fullscreenBtn) {
      fullscreenBtn.classList.toggle('is-active', expanded);
      fullscreenBtn.setAttribute('aria-label', expanded ? '收起路线介绍' : '展开地图');
    }
    // 展开地图时触发 resize 让高德重新计算容器尺寸
    if (expanded && mapAdapter && mapAdapter._map) {
      setTimeout(() => mapAdapter._map.resize(), 300);
    }
    if (expanded) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', togglePanelFullscreen);
  }
  fsFsCloseBtn.addEventListener('click', closeFullscreen);

  /* ---- 构建景点列表 --------------------------------- */
  function buildSpotList(spots) {
    if (!spotList) return;
    spotList.innerHTML = spots
      .map((spot, idx) => {
        const tagsHtml = (spot.tags || [])
          .map((tag) => `<span class="rd-ex-tag">${tag}</span>`)
          .join('');
        const photosHtml = (spot.photos || [])
          .map(
            (photo, pIdx) => `
              <div class="rd-spot-gallery-item">
                <img src="${photo}" alt="${spot.name}照片${pIdx + 1}" loading="lazy" />
              </div>
            `
          )
          .join('');
        const subtitleHtml = spot.subtitle
          ? `<p class="rd-spot-subtitle">${spot.subtitle}</p>`
          : '';
        return `
          <div class="rd-spot-card" data-spot-idx="${idx}" id="spot-card-${idx}">
            <div class="rd-spot-thumb">
              <span class="rd-spot-number">${idx + 1}</span>
              <img src="${spot.thumb || ''}" alt="${spot.name}" class="rd-spot-thumb-img" loading="lazy" />
            </div>
            <div class="rd-spot-info">
              <div class="rd-spot-title-row">
                <h3 class="rd-spot-name">${spot.name}</h3>
                <button class="rd-spot-expand-btn" data-spot-idx="${idx}" aria-label="展开或收起">▸</button>
              </div>
              ${subtitleHtml}
            </div>
          </div>
          <div class="rd-spot-expanded" id="spot-expanded-${idx}">
            <div class="rd-spot-ex-content">
              <p>${spot.detail || spot.short_desc || ''}</p>
              <div class="rd-spot-ex-tags">${tagsHtml}</div>
              <div class="rd-spot-gallery">${photosHtml}</div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function closeAllSpotCards() {
    document.querySelectorAll('.rd-spot-expanded').forEach((el) => el.classList.remove('open'));
    document.querySelectorAll('.rd-spot-expand-btn').forEach((btn) => {
      btn.classList.remove('expanded');
      btn.textContent = '▸';
    });
    document.querySelectorAll('.rd-spot-card').forEach((card) => card.classList.remove('active'));
  }

  function bindSpotToggleEvents() {
    document.querySelectorAll('.rd-spot-card').forEach((card) => {
      card.addEventListener('click', () => {
        const idx = card.getAttribute('data-spot-idx');
        const expanded = document.getElementById(`spot-expanded-${idx}`);
        const btn = card.querySelector('.rd-spot-expand-btn');
        if (!expanded || !btn) return;

        const isOpen = expanded.classList.contains('open');
        closeAllSpotCards();

        if (!isOpen) {
          expanded.classList.add('open');
          card.classList.add('active');
          btn.classList.add('expanded');
          btn.textContent = '▾';
        }
      });
    });
  }

  /* ---- 主入口 —— 加载数据 → 渲染 → 初始化地图 ---------- */
  async function main() {
    const routeData = await loadRouteData();
    const spots = routeData ? routeData.spots : getFallbackSpots();

    currentSpots = spots; // 保存到全局，供切换引擎使用
    buildSpotList(spots);
    bindSpotToggleEvents();
    await initMap(spots);
  }

  /* ---- 内嵌备份数据（loadRouteData 失败时使用）---------- */
  function getFallbackSpots() {
    const A = 'assets/routes/yangmeizhu-heritage/';
    return [
      { name: '青云阁及二层模范咖啡', subtitle: '高停留时间型空间', short_desc: '清末民初北京「四大商场」之一旧址，二楼「模范咖啡」适合慢坐。', detail: '', tags: ['🏛️ 老商场旧址', '☕ 胡同咖啡'], thumb: A+'qingyun-pavilion.png', photos: [A+'qingyun-pavilion.png'], lat: 39.896134, lng: 116.393245 },
      { name: '张忠强兔儿爷非遗传承店', subtitle: '老北京中秋民俗 · 泥塑「兔儿爷」', short_desc: '杨梅竹斜街上的非遗工作室。', detail: '', tags: ['🐰 中秋民俗', '🎨 泥塑彩绘'], thumb: A+'tuerye-1.png', photos: [A+'tuerye-1.png'], lat: 39.895982, lng: 116.394123 },
      { name: '铃木食堂', subtitle: '高情绪价值型餐厅', short_desc: '藏在胡同里的日式小食堂。', detail: '', tags: ['🍚 日式食堂', '🌙 适合晚餐'], thumb: A+'suzuki-exterior.png', photos: [A+'suzuki-exterior.png'], lat: 39.895321, lng: 116.394123 },
      { name: '乾坤空间文创', subtitle: '可以逛的展览空间', short_desc: '像小型美术馆的文创店。', detail: '', tags: ['🖼️ 展陈式零售', '🧵 刺绣书画'], thumb: A+'qiankun-space.png', photos: [A+'qiankun-space.png'], lat: 39.895678, lng: 116.392156 },
      { name: '将将堂印章', subtitle: '低流量但高转化的深体验型店', short_desc: '专注篆刻与钤印体验。', detail: '', tags: ['🖌️ 篆刻钤印', '📇 手帐纪念'], thumb: A+'jiangjiangtang.png', photos: [A+'jiangjiangtang.png'], lat: 39.894987, lng: 116.393567 },
    ];
  }

  /* ---- Start Journey button ----------------------- */
  document.getElementById('rd-start-btn').addEventListener('click', () => {
    const btn = document.getElementById('rd-start-btn');
    btn.textContent = '导航启动中…';
    btn.style.opacity = '0.7';
    setTimeout(() => {
      window.location.href = 'ai-chat.html';
    }, 600);
  });

  /* ---- Favorite button logic ---------------------- */
  const favBtn = document.getElementById('rd-fav-btn');
  if (favBtn) {
    favBtn.addEventListener('click', () => {
      favBtn.classList.toggle('is-favorited');
    });
  }

  /* ---- AI guide button ---------------------------- */
  document.getElementById('rd-ai-btn').addEventListener('click', () => {
    window.location.href = 'ai-chat.html?consult=1';
  });

  /* ---- 启动 -------------------------------------- */
  main().catch(err => console.error('[route-detail] 初始化异常:', err));

})();


