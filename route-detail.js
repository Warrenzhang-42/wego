/* ====================================================
   WeGO — Route Detail Page · route-detail.js
   ==================================================== */

(function () {
  'use strict';

  const LOCAL_IMAGES = {
    hutong: '/Users/a111111/.gemini/antigravity/brain/2ae3e13e-4b00-463f-830e-75ee220409db/spot_hutong_houhai_1774578137395.png',
    museum: '/Users/a111111/.gemini/antigravity/brain/c1ac1afa-9609-4abf-b6c3-bcad842c7764/spot_museum_1774541185996.png',
    oldTown: '/Users/a111111/.gemini/antigravity/brain/c1ac1afa-9609-4abf-b6c3-bcad842c7764/spot_old_town_1774541150339.png',
    forbiddenCity: '/Users/a111111/.gemini/antigravity/brain/2ae3e13e-4b00-463f-830e-75ee220409db/spot_forbidden_city_1774578102745.png',
    summerPalace: '/Users/a111111/.gemini/antigravity/brain/2ae3e13e-4b00-463f-830e-75ee220409db/spot_summer_palace_1774578169000.png',
    foodMarket: '/Users/a111111/.gemini/antigravity/brain/c1ac1afa-9609-4abf-b6c3-bcad842c7764/spot_food_market_1774541131161.png',
  };

  /* ---- Spot data ---------------------------------- */
  const SPOT_DATA = [
    {
      name: '大栅栏商业街',
      shortDesc: '北京最具代表性的历史商业街区之一，老字号林立。',
      detail:
        '大栅栏形成于明代，至今已有数百年历史，汇集了同仁堂、内联升等传统商号，是观察北京城市商业演进与胡同文化的重要窗口。',
      tags: ['🏛️ 历史街区', '🛍️ 老字号', '⏱️ 建议40分钟'],
      thumb: LOCAL_IMAGES.hutong,
      photos: [LOCAL_IMAGES.hutong, LOCAL_IMAGES.oldTown, LOCAL_IMAGES.forbiddenCity],
      mapX: 298,
      mapY: 108,
    },
    {
      name: '梅兰芳故居',
      shortDesc: '京剧大师梅兰芳晚年居所，保存大量戏曲文献与实物。',
      detail:
        '梅兰芳故居位于北京护国寺街附近，为典型四合院形制。院内陈列戏服、手稿、照片与生活陈设，是了解京剧艺术传承的重要地点。',
      tags: ['🎭 京剧文化', '🏠 四合院', '⏱️ 建议30分钟'],
      thumb: LOCAL_IMAGES.museum,
      photos: [LOCAL_IMAGES.museum, LOCAL_IMAGES.hutong, LOCAL_IMAGES.foodMarket],
      mapX: 143,
      mapY: 108,
    },
    {
      name: '煤市街博物馆',
      shortDesc: '社区记忆博物馆，展示胡同居民生活史与城市变迁。',
      detail:
        '煤市街博物馆以口述史、老照片与日常器物为主线，呈现大栅栏片区从清末到当代的社区记忆，是了解“北京生活方式史”的微型样本。',
      tags: ['📸 社区记忆', '🏺 民俗展陈', '⏱️ 建议45分钟'],
      thumb: LOCAL_IMAGES.oldTown,
      photos: [LOCAL_IMAGES.oldTown, LOCAL_IMAGES.hutong, LOCAL_IMAGES.museum],
      mapX: 64,
      mapY: 150,
    },
    {
      name: '纪晓岚故居',
      shortDesc: '清代文人宅邸遗址，兼具人文典故与古都建筑特色。',
      detail:
        '纪晓岚故居与《四库全书》编纂历史密切相关，院落空间保留了京师士大夫住宅格局，适合结合清代学术史与文人生活方式进行导览。',
      tags: ['📚 清代文史', '🌳 古建院落', '⏱️ 建议35分钟'],
      thumb: LOCAL_IMAGES.forbiddenCity,
      photos: [LOCAL_IMAGES.forbiddenCity, LOCAL_IMAGES.summerPalace, LOCAL_IMAGES.oldTown],
      mapX: 215,
      mapY: 210,
    },
    {
      name: '陕西巷',
      shortDesc: '保存完好的老胡同，感受市井烟火气',
      mapX: 298,
      mapY: 175,
    },
  ];


  /* ---- Elements ----------------------------------- */
  const mapWrapper     = document.getElementById('rd-map-wrapper');
  const mapSvg         = document.getElementById('rd-map-svg');
  const tooltip        = document.getElementById('map-spot-tooltip');
  const detailPanel    = document.getElementById('rd-detail-panel');
  const spotList       = document.getElementById('rd-spot-list');
  const fsOverlay      = document.getElementById('rd-fullscreen-overlay');
  const fsFsCloseBtn   = document.getElementById('rd-fs-close-btn');
  const fsPills        = document.querySelectorAll('.rd-fs-pill');

  // Back button
  document.getElementById('rd-back-btn').addEventListener('click', () => {
    window.history.back();
  });

  /* ---- Map Spot Markers (click = tooltip only) ---- */
  let tooltipTimeout = null;
  document.querySelectorAll('.map-spot-marker').forEach((marker) => {
    marker.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx  = parseInt(marker.getAttribute('data-spot'));
      const spot = SPOT_DATA[idx];
      if (!spot) return;

      // Position tooltip near the marker
      const svgRect  = mapSvg.getBoundingClientRect();
      const svgVW    = mapSvg.viewBox.baseVal.width;
      const svgVH    = mapSvg.viewBox.baseVal.height;
      const scaleX   = svgRect.width  / svgVW;
      const scaleY   = svgRect.height / svgVH;
      const px       = spot.mapX * scaleX;
      const py       = spot.mapY * scaleY;

      // Use simple bottom center for all
      tooltip.querySelector('.mst-name').textContent = spot.name;
      tooltip.querySelector('.mst-desc').textContent = spot.shortDesc || spot.desc || '';
      tooltip.style.left   = px + 'px';
      tooltip.style.bottom = (mapSvg.getBoundingClientRect().height - py + 10) + 'px';
      tooltip.style.transform = 'translateX(-50%)';
      tooltip.classList.add('visible');

      clearTimeout(tooltipTimeout);
      tooltipTimeout = setTimeout(() => {
        tooltip.classList.remove('visible');
      }, 3000);
    });
  });

  // Hide tooltip on map tap elsewhere
  mapSvg.addEventListener('click', () => {
    tooltip.classList.remove('visible');
  });

  /* ---- Fullscreen --------------------------------- */
  function openFullscreen() {
    // Clone the map SVG
    const fsContainer = fsOverlay.querySelector('.rd-fs-map-container');
    fsContainer.innerHTML = '';
    const clonedSvg = mapSvg.cloneNode(true);
    clonedSvg.style.cssText = 'width:100%;height:100%;';
    clonedSvg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    fsContainer.appendChild(clonedSvg);

    // Re-attach spot click handlers on cloned svg
    clonedSvg.querySelectorAll('.map-spot-marker').forEach((marker) => {
      marker.style.cursor = 'pointer';
      // spots clickable but no visible effect per spec
    });

    fsOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeFullscreen() {
    fsOverlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  const togglePanelFullscreen = (e) => {
    e.stopPropagation();
    const isFull = detailPanel.classList.toggle('is-full');
    const btn = document.getElementById('rd-fullscreen-text-btn');
    btn.textContent = isFull ? '收起' : '全屏';

    if (isFull) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  document.getElementById('rd-fullscreen-btn').addEventListener('click', togglePanelFullscreen);
  document.getElementById('rd-fullscreen-text-btn').addEventListener('click', togglePanelFullscreen);

  fsFsCloseBtn.addEventListener('click', closeFullscreen);



  function buildSpotList() {
    if (!spotList) return;
    const listData = SPOT_DATA.slice(0, 4);
    spotList.innerHTML = listData
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
        return `
          <div class="rd-spot-card" data-spot-idx="${idx}" id="spot-card-${idx}">
            <div class="rd-spot-number">${idx + 1}</div>
            <div class="rd-spot-thumb">
              <img src="${spot.thumb || ''}" alt="${spot.name}" class="rd-spot-thumb-img" loading="lazy" />
            </div>
            <div class="rd-spot-info">
              <div class="rd-spot-title-row">
                <h3 class="rd-spot-name">${spot.name}</h3>
                <button class="rd-spot-expand-btn" data-spot-idx="${idx}" aria-label="展开或收起">▸</button>
              </div>
              <p class="rd-spot-desc">景点说明：${spot.shortDesc || ''}</p>
            </div>
          </div>
          <div class="rd-spot-expanded" id="spot-expanded-${idx}">
            <div class="rd-spot-ex-content">
              <p>${spot.detail || ''}</p>
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

  buildSpotList();
  bindSpotToggleEvents();

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

  /* ---- AI guide button placeholder ---------------- */
  document.getElementById('rd-ai-btn').addEventListener('click', () => {
    alert('AI导游功能即将上线，敬请期待！');
  });

})();
