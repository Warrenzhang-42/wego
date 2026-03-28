/* ====================================================
   WeGO — Route Detail Page · route-detail.js
   ==================================================== */

(function () {
  'use strict';

  const A = 'assets/routes/yangmeizhu-heritage/';

  /* ---- Spot data · 大栅栏杨梅竹斜街非遗体验 ---------------------------------- */
  const SPOT_DATA = [
    {
      name: '青云阁及二层模范咖啡',
      subtitle: '高停留时间型空间',
      shortDesc:
        '清末民初北京「四大商场」之一的青云阁旧址，青砖拱券与石匾仍在；二楼「模范咖啡」适合慢坐、发呆、读胡同。',
      detail:
        '青云阁曾是大栅栏一带重要的综合性商场，如今沿街仍可见砖砌立面与「青雲閣」石匾，二层拱窗漆成暖红，是很多人打卡杨梅竹斜街的经典角度。二层的「模范咖啡」把灰瓦木格与玻璃橱窗拼在一起，窗上圆点贴纸又带点当代趣味，室内光线偏暖，适合作为「走累了」的停留点：点一杯手冲或奶咖，看斜街人流与瓦片天际线，阅读成本很低。周末下午座位紧张，可错峰上午或傍晚前来。',
      tags: ['🏛️ 老商场旧址', '☕ 胡同咖啡', '⏱️ 建议45～60分钟'],
      thumb: A + 'qingyun-pavilion.png',
      photos: [A + 'qingyun-pavilion.png', A + 'mofan-coffee.png'],
      mapX: 143,
      mapY: 108,
    },
    {
      name: '张忠强兔儿爷非遗传承店',
      subtitle: '老北京中秋民俗 · 泥塑「兔儿爷」',
      shortDesc:
        '杨梅竹斜街上的非遗工作室，满墙彩塑兔儿爷与媒体报道剪贴，一眼能认出「京味中秋」的符号。',
      detail:
        '兔儿爷是老北京中秋祭月与赏玩里的泥塑角色，身着短甲、手持药杵，寓意吉祥。张忠强传承店门面挂着「老北京兔儿爷」与市级非遗标识，店内从巴掌大到尺高的作品排满架，红蓝绿金对比强烈；墙上常有报刊报道与活动留影。若时间允许，可向店员了解开胎、修坯、彩绘的流程，部分时段会开放「兔儿爷 DIY / 彩绘」体验（以现场公告与预约为准）。建议避开正午人流高峰，便于拍照与细看。',
      tags: ['🐰 中秋民俗', '🎨 泥塑彩绘', '⏱️ 建议30～45分钟'],
      thumb: A + 'tuerye-1.png',
      photos: [A + 'tuerye-1.png', A + 'tuerye-2.png'],
      mapX: 298,
      mapY: 108,
    },
    {
      name: '铃木食堂',
      subtitle: '高情绪价值型餐厅',
      shortDesc:
        '藏在胡同里的日式小食堂，木格大窗与暖黄灯光，适合作为斜街线的「情绪收尾」。',
      detail:
        '铃木食堂在杨梅竹斜街一带口碑稳定，外立面灰瓦木梁，入夜灯一亮，巷子里很有「终于坐下来」的安慰感。菜单走日式家常路线，常有手绘水彩菜图与中英日对照，秋季限定、丼饭与锅物类点单率高；饮品里梅子酒等适合小酌一杯。价位在中等偏亲民区间，热门时段需排队，建议提前取号或避开周末正餐高峰。若只吃下午茶，也可点甜品与咖啡，把晚餐留给下一程。',
      tags: ['🍚 日式食堂', '🌙 适合晚餐', '⏱️ 建议60～90分钟'],
      thumb: A + 'suzuki-exterior.png',
      photos: [A + 'suzuki-exterior.png', A + 'suzuki-menu.png'],
      mapX: 298,
      mapY: 175,
    },
    {
      name: '乾坤空间文创',
      subtitle: '可以逛的展览空间',
      shortDesc:
        '像小型美术馆的文创店：刺绣、书画、胡同主题插画与帆布袋，动线迂回，适合慢慢淘。',
      detail:
        '乾坤空间把「零售」做成「可逛的展」：木门上贴着「藏」字与胡同长卷式海报，室内有刺绣挂片、戏刀陈设与大量书画气质的周边，帆布包与纸品常把北京城景、字谜与当代设计叠在一起。这里不适合赶时间扫货，更适合放慢脚步，把每一件纹样与胡同叙事对上号；若喜欢独立出版物或东方配色的小物，往往能挑到与景区通货不同的东西。',
      tags: ['🖼️ 展陈式零售', '🧵 刺绣书画', '⏱️ 建议30～40分钟'],
      thumb: A + 'qiankun-space.png',
      photos: [A + 'qiankun-space.png'],
      mapX: 64,
      mapY: 150,
    },
    {
      name: '将将堂印章',
      subtitle: '低流量但高转化的深体验型店',
      shortDesc:
        '专注篆刻与钤印体验，一方石、一盒印泥，就能把旅行记忆压进纸里带走。',
      detail:
        '将将堂不是走马观花型的「盖章点」，而是偏工作室气质的印文化空间：白卡纸、回纹边框与多枚篆刻印章组合，盖出来像小型金石小品。客流相对克制，愿意坐下来的人往往冲着手作感与「可带走的成品」而来，转化路径短但体验深。可自备手帐或现场选购纸笺；盖印时轻压慢起，避免糊边。具体开放时间与是否需预约，建议行前电话或社交平台确认。',
      tags: ['🖌️ 篆刻钤印', '📇 手帐纪念', '⏱️ 建议20～35分钟'],
      thumb: A + 'jiangjiangtang.png',
      photos: [A + 'jiangjiangtang.png'],
      mapX: 215,
      mapY: 210,
    },
  ];


  /* ---- Elements ----------------------------------- */
  const app            = document.getElementById('app');
  const mapWrapper     = document.getElementById('rd-map-wrapper');
  const mapSvg         = document.getElementById('rd-map-svg');
  const tooltip        = document.getElementById('map-spot-tooltip');
  const detailPanel    = document.getElementById('rd-detail-panel');
  const fullscreenBtn  = document.getElementById('rd-fullscreen-btn');
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
    const fsContainer = fsOverlay.querySelector('.rd-fs-map-container');
    fsContainer.innerHTML = '';
    const img = document.createElement('img');
    img.src = 'assets/maps/dashilan-base-map.png';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.style.cssText =
      'width:100%;height:100%;object-fit:cover;object-position:center;background:#eff1f0;display:block;';
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
    if (expanded) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', togglePanelFullscreen);
  }

  fsFsCloseBtn.addEventListener('click', closeFullscreen);



  function buildSpotList() {
    if (!spotList) return;
    const listData = SPOT_DATA.slice(0, 5);
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

  /* ---- AI guide: first-time route consultation chat ---- */
  document.getElementById('rd-ai-btn').addEventListener('click', () => {
    window.location.href = 'ai-chat.html?consult=1';
  });

})();
