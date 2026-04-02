/* ====================================================
   WeGO — Route Detail Page · route-detail.js
   Sprint 2.8：数据源升级，通过 apiClient 加载路线数据
   ==================================================== */

import { MapAdapterFactory } from './lib/map-adapter.js';
import { apiClient }         from './lib/api-client.js';

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

  /* 返回 / 开始旅程 / 问问导游 由 route-detail.html 内联脚本绑定，避免 ES 模块加载失败时整页无响应 */

  /* ---- 当前路线 ID（从 URL 参数或默认大栅栏路线）---------- */
  const _urlParams = new URLSearchParams(window.location.search);
  const ROUTE_ID = _urlParams.get('route') || 'e4e20790-a521-4f0e-947b-1172a1e1b7f1';

  /* ---- 通过 apiClient 加载路线数据 ----------------------- */
  async function loadRouteData() {
    try {
      // getRouteWithSpots 同时返回路线 meta + 排好序的景点列表
      const route = await apiClient.getRouteWithSpots(ROUTE_ID);
      console.log(`[route-detail] 数据源: ${apiClient.mode}，路线: ${route.title}`);
      return route;
    } catch (err) {
      console.error('[route-detail] 路线数据加载失败，使用内嵌备份数据:', err);
      return null;
    }
  }

  /** Supabase NUMERIC 等可能序列化为字符串，统一为 number，避免 fitBounds / 标记异常 */
  function normalizeSpots(raw) {
    const list = Array.isArray(raw) ? raw : [];
    return list
      .map((s) => ({
        ...s,
        lat: typeof s.lat === 'number' && !Number.isNaN(s.lat) ? s.lat : parseFloat(s.lat),
        lng: typeof s.lng === 'number' && !Number.isNaN(s.lng) ? s.lng : parseFloat(s.lng),
      }))
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  }

  /* ---- 初始化地图 (多引擎驱动) ------------------------ */
  async function initMap(spots) {
    const config = window.__WEGO_MAP_CONFIG__ || {};
    const provider = config.provider || 'amap';

    // 检查是否有足够的配置进行初始化
    if (!config.apiKey && !config.key) {
      console.warn(`[route-detail] 未配置 ${provider} API Key，跳过地图初始化，使用静态图降级`);
      if (mapFallbackImg) mapFallbackImg.style.display = 'block';
      if (mapContainer) mapContainer.style.display = 'none';
      return;
    }

    try {
      if (mapContainer) {
        mapContainer.style.display = '';
        mapContainer.style.visibility = 'visible';
      }
      if (mapFallbackImg) mapFallbackImg.style.display = 'none';

      // 使用工厂类创建适配器
      mapAdapter = MapAdapterFactory.create(provider, mapContainer, {
        apiKey:         config.apiKey || config.key,
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

      // 2. 绘制路线 / 视野：失败时仅打日志，仍保留底图与标记
      const coords = spots.map(s => ({ lat: s.lat, lng: s.lng }));
      try {
        if (coords.length >= 2) {
          await mapAdapter.drawRoute(coords);
        } else if (coords.length === 1) {
          mapAdapter.setCenter(coords[0].lng, coords[0].lat, 17);
        }
      } catch (routeErr) {
        console.warn('[route-detail] 路线绘制跳过（底图仍可用）:', routeErr);
      }
      try {
        if (spots.length >= 1) {
          const lats = spots.map(s => s.lat);
          const lngs = spots.map(s => s.lng);
          mapAdapter.fitBounds({
            sw: { lat: Math.min(...lats) - 0.001, lng: Math.min(...lngs) - 0.001 },
            ne: { lat: Math.max(...lats) + 0.001, lng: Math.max(...lngs) + 0.001 },
          });
        }
      } catch (boundsErr) {
        console.warn('[route-detail] fitBounds 跳过:', boundsErr);
      }

      if (provider === 'amap' && mapAdapter._map && typeof mapAdapter._map.resize === 'function') {
        setTimeout(() => {
          try {
            mapAdapter._map.resize();
          } catch (e) {
            /* ignore */
          }
        }, 400);
      }

      console.log(`[route-detail] ✅ ${provider} 地图初始化完成`);

    } catch (err) {
      console.error(`[route-detail] ${provider} 地图初始化失败，使用静态图降级:`, err);
      mapAdapter = null;
      if (mapFallbackImg) mapFallbackImg.style.display = 'block';
      if (mapContainer) mapContainer.style.display = 'none';
    }
  }

  /* ---- 导出切换引擎方法 ---------------------------- */
  window.switchMapEngine = async (provider) => {
    if (!currentSpots || !currentSpots.length) return;

    console.log(`[route-detail] 正在切换引擎记录为: ${provider}`);

    if (mapAdapter) {
      try {
        mapAdapter.destroy();
      } catch (e) {
        console.warn('[route-detail] 销毁旧地图实例:', e);
      }
      mapAdapter = null;
    }
    if (mapContainer) mapContainer.innerHTML = '';

    window.__WEGO_MAP_CONFIG__.provider = provider;
    await initMap(currentSpots);
    await restoreCheckins(currentSpots);
  };

  // 全局变量保存当前景点数据以供切换使用
  let currentSpots = [];

  /* ---- Fullscreen --------------------------------- */
  function openFullscreen() {
    if (!fsOverlay) return;
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
    if (!fsOverlay) return;
    fsOverlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  const togglePanelFullscreen = (e) => {
    e.stopPropagation();
    if (!app || !detailPanel) return;
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
  if (fsFsCloseBtn) {
    fsFsCloseBtn.addEventListener('click', closeFullscreen);
  }

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
              <div class="rd-spot-checkin-row">
                <button type="button" class="rd-spot-checkin-btn" data-spot-idx="${idx}" data-spot-id="${spot.id || ''}" aria-label="在此景点打卡">
                  在此打卡
                </button>
              </div>
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

  /** Sprint 6：恢复打卡记录 → 勋章标记 + 按钮状态 */
  async function restoreCheckins(spots) {
    let rows = [];
    try {
      rows = await apiClient.getCheckins();
    } catch (e) {
      console.warn('[route-detail] 读取打卡记录失败:', e);
      return;
    }

    const done = new Set(rows.map((r) => r.spot_id));
    spots.forEach((s) => {
      if (s.id && done.has(s.id)) {
        const btn = document.querySelector(`.rd-spot-checkin-btn[data-spot-id="${s.id}"]`);
        if (btn) {
          btn.disabled = true;
          btn.classList.add('is-done');
          btn.textContent = '已打卡';
        }
      }
    });

    if (!mapAdapter) return;
    const bySpot = new Map(spots.map((s) => [s.id, s]));
    for (const row of rows) {
      const sp = bySpot.get(row.spot_id);
      if (!sp) continue;
      const lat = typeof row.lat === 'number' ? row.lat : parseFloat(row.lat);
      const lng = typeof row.lng === 'number' ? row.lng : parseFloat(row.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      try {
        mapAdapter.addCheckinMarker(lng, lat, { label: sp.name });
      } catch (e) {
        console.warn('[route-detail] 打卡标记渲染失败:', e);
      }
    }
  }

  function bindCheckinButtons(spots) {
    document.querySelectorAll('.rd-spot-checkin-btn').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-spot-idx'), 10);
        const spot = spots[idx];
        if (!spot || !spot.id) {
          console.warn('[route-detail] 景点缺少 id，无法打卡');
          return;
        }
        if (btn.classList.contains('is-done') || btn.disabled) return;

        const run = async (lat, lng) => {
          try {
            await apiClient.saveCheckin({
              spot_id: spot.id,
              lat,
              lng,
            });
            if (mapAdapter) {
              mapAdapter.addCheckinMarker(lng, lat, { label: spot.name });
            }
            btn.disabled = true;
            btn.classList.add('is-done');
            btn.textContent = '已打卡';
          } catch (err) {
            console.error('[route-detail] 打卡失败:', err);
          }
        };

        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => run(pos.coords.latitude, pos.coords.longitude),
            () => run(spot.lat, spot.lng),
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
          );
        } else {
          await run(spot.lat, spot.lng);
        }
      });
    });
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
    let spots = normalizeSpots(routeData?.spots);
    if (spots.length === 0) {
      spots = getFallbackSpots();
    }

    currentSpots = spots; // 保存到全局，供切换引擎使用
    buildSpotList(spots);
    bindSpotToggleEvents();
    bindCheckinButtons(spots);
    await initMap(spots);
    await restoreCheckins(spots);
  }

  /* ---- 内嵌备份数据（loadRouteData 失败时使用）---------- */
  function getFallbackSpots() {
    const A = 'assets/routes/yangmeizhu-heritage/';
    return [
      { id: '7f8a1b2c-3d4e-4f5a-8b9c-0d1e2f3a4b5c', name: '青云阁及二层模范咖啡', subtitle: '高停留时间型空间', short_desc: '清末民初北京「四大商场」之一旧址，二楼「模范咖啡」适合慢坐。', detail: '', tags: ['🏛️ 老商场旧址', '☕ 胡同咖啡'], thumb: A+'qingyun-pavilion.png', photos: [A+'qingyun-pavilion.png'], lat: 39.896134, lng: 116.393245, sort_order: 1 },
      { id: 'a1b2c3d4-e5f6-4a5b-bc6d-7e8f9a0b1c2d', name: '张忠强兔儿爷非遗传承店', subtitle: '老北京中秋民俗 · 泥塑「兔儿爷」', short_desc: '杨梅竹斜街上的非遗工作室。', detail: '', tags: ['🐰 中秋民俗', '🎨 泥塑彩绘'], thumb: A+'tuerye-1.png', photos: [A+'tuerye-1.png'], lat: 39.895982, lng: 116.394123, sort_order: 2 },
      { id: 'b2c3d4e5-f6a7-4b6c-cd7d-8e9f0a1b2c3d', name: '铃木食堂', subtitle: '高情绪价值型餐厅', short_desc: '藏在胡同里的日式小食堂。', detail: '', tags: ['🍚 日式食堂', '🌙 适合晚餐'], thumb: A+'suzuki-exterior.png', photos: [A+'suzuki-exterior.png'], lat: 39.895321, lng: 116.394123, sort_order: 3 },
      { id: 'c3d4e5f6-a7b8-4c7d-de8e-9f0a1b2c3d4e', name: '乾坤空间文创', subtitle: '可以逛的展览空间', short_desc: '像小型美术馆的文创店。', detail: '', tags: ['🖼️ 展陈式零售', '🧵 刺绣书画'], thumb: A+'qiankun-space.png', photos: [A+'qiankun-space.png'], lat: 39.895678, lng: 116.392156, sort_order: 4 },
      { id: 'd4e5f6a7-b8c9-4d8e-ef9f-0a1b2c3d4e5f', name: '将将堂印章', subtitle: '低流量但高转化的深体验型店', short_desc: '专注篆刻与钤印体验。', detail: '', tags: ['🖌️ 篆刻钤印', '📇 手帐纪念'], thumb: A+'jiangjiangtang.png', photos: [A+'jiangjiangtang.png'], lat: 39.894987, lng: 116.393567, sort_order: 5 },
    ];
  }

  /* ---- Favorite button logic ---------------------- */
  const favBtn = document.getElementById('rd-fav-btn');
  if (favBtn) {
    favBtn.addEventListener('click', () => {
      favBtn.classList.toggle('is-favorited');
    });
  }

  /* ---- 启动 -------------------------------------- */
  main().catch(err => console.error('[route-detail] 初始化异常:', err));

})();


