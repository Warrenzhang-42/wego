/* ====================================================
   WeGO — Route Detail Page · route-detail.js
   ==================================================== */

(function () {
  'use strict';

  /* ---- Spot data ---------------------------------- */
  const SPOT_DATA = [
    {
      name: '大栅栏商业街',
      desc: '百年前商贾云集之地，感受民国风韵',
      mapX: 298, mapY: 108,
    },
    {
      name: '梅兰芳故居',
      desc: '京剧大师的四合院旧居，珍贵戏剧文物',
      mapX: 143, mapY: 108,
    },
    {
      name: '煤市街第一博物馆',
      desc: '社区博物馆，老北京居民百年生活记忆',
      mapX: 64, mapY: 150,
    },
    {
      name: '纪晓岚故居',
      desc: '清代文学家故居，书香雅致古院深深',
      mapX: 215, mapY: 210,
    },
    {
      name: '陕西巷',
      desc: '保存完好的老胡同，感受市井烟火气',
      mapX: 298, mapY: 175,
    },
  ];

  /* ---- Stat data ---------------------------------- */
  const STAT_DATA = {
    spots: {
      icon: '📍',
      title: '景点列表',
      items: ['大栅栏商业街', '梅兰芳故居', '煤市街第一博物馆', '纪晓岚故居'],
    },
    stories: {
      icon: '📖',
      title: '路线故事',
      items: ['「百年大栅栏」—— 从繁华商街到文化地标的历史变迁'],
    },
    eggs: {
      icon: '🥚',
      title: '隐藏彩蛋',
      items: [
        '同仁堂百年秘方展示',
        '内联升手工鞋制作现场',
        '谭家菜传统技艺体验',
        '老字号月饼制作秘籍',
        '大栅栏夜市地图（1920年代）',
        '胡同里的邮票收藏家',
        '梅兰芳最后一次演出戏服',
        '纪晓岚亲笔手稿复刻',
        '陕西巷民间杂耍记录',
        '煤市街老照片360°还原',
      ],
    },
    knowledge: {
      icon: '💡',
      title: '知识卡片',
      items: [
        '大栅栏名称由来：明永乐年间设置栅栏防盗，"大"字体现规模之大',
        '胡同文化：北京胡同源于元代，"胡同"一词来自蒙古语"水井"',
      ],
    },
    activities: {
      icon: '🎯',
      title: '互动活动',
      items: [
        '传统手工艺体验：剪纸、泥塑（需预约）',
        '老字号美食打卡挑战',
        'AR寻宝：扫描指定景点解锁限定徽章',
      ],
    },
    photos: {
      icon: '📸',
      title: '热门打卡点',
      items: [
        '大栅栏牌楼（56张用户照片）',
        '梅兰芳故居戏服展台',
        '胡同夏日晾晒图',
        '纪晓岚书斋还原陈设',
      ],
    },
    tips: {
      icon: '💬',
      title: '旅行贴士',
      items: [
        '建议工作日游览，周末人流较多',
        '最佳游览时间：上午9:00–11:30',
        '随身携带现金，部分老字号不支持扫码',
        '穿着舒适平底鞋，石板路较多',
        '梅兰芳故居需提前在官网预约',
        '附近有公共厕所：煤市街北口',
        '全程约3公里，适合徒步',
      ],
    },
  };

  /* ---- Elements ----------------------------------- */
  const mapWrapper     = document.getElementById('rd-map-wrapper');
  const mapSvg         = document.getElementById('rd-map-svg');
  const tooltip        = document.getElementById('map-spot-tooltip');
  const detailPanel    = document.getElementById('rd-detail-panel');
  const statsStrip     = document.getElementById('rd-stats-strip');
  const statDetailArea = document.getElementById('rd-stat-detail-area');
  const spotList       = document.getElementById('rd-spot-list');
  const fsOverlay      = document.getElementById('rd-fullscreen-overlay');
  const fsFsCloseBtn   = document.getElementById('rd-fs-close-btn');
  const fsStatBtns     = document.querySelectorAll('.rd-stat-item');
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
      tooltip.querySelector('.mst-desc').textContent = spot.desc;
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

  // Fullscreen spot pills
  fsPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      fsPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
    });
  });

  /* ---- Stats Strip -------------------------------- */
  let activeStatKey = 'spots';

  function renderStatDetail(key) {
    const data = STAT_DATA[key];
    if (!data) { statDetailArea.innerHTML = ''; statDetailArea.classList.remove('open'); return; }

    const itemsHtml = data.items.map((item, i) => `
      <div class="rd-stat-card-item">
        <span class="rd-stat-card-item-num">${i + 1}</span>
        <span>${item}</span>
      </div>
    `).join('');

    statDetailArea.innerHTML = `
      <div class="rd-stat-card">
        <div class="rd-stat-card-title">
          <span class="stat-icon">${data.icon}</span>
          ${data.title}
        </div>
        <div class="rd-stat-card-list">
          ${itemsHtml}
        </div>
      </div>
    `;
    // Force reflow for animation
    statDetailArea.offsetHeight;
    statDetailArea.classList.add('open');
  }

  statsStrip.querySelectorAll('.rd-stat-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-stat');

      // Toggle: click same = close
      if (activeStatKey === key && statDetailArea.classList.contains('open')) {
        statDetailArea.classList.remove('open');
        activeStatKey = null;
        // Remove all active
        statsStrip.querySelectorAll('.rd-stat-item').forEach((b) => b.classList.remove('active'));
        return;
      }

      statsStrip.querySelectorAll('.rd-stat-item').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeStatKey = key;

      // Close first then re-open for animation
      statDetailArea.classList.remove('open');
      requestAnimationFrame(() => {
        renderStatDetail(key);
      });

      // Scroll the strip so this btn is visible
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  });

  // Init: render spots stat
  renderStatDetail('spots');

  /* ---- Spot card expand / collapse ---------------- */
  document.querySelectorAll('.rd-spot-expand-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx      = btn.getAttribute('data-spot-idx');
      const expanded = document.getElementById(`spot-expanded-${idx}`);
      const card     = document.getElementById(`spot-card-${idx}`);
      const isOpen   = expanded.classList.contains('open');

      // Close all
      document.querySelectorAll('.rd-spot-expanded').forEach((el) => el.classList.remove('open'));
      document.querySelectorAll('.rd-spot-expand-btn').forEach((b) => b.classList.remove('expanded'));
      document.querySelectorAll('.rd-spot-card').forEach((c) => c.classList.remove('active'));

      if (!isOpen) {
        expanded.classList.add('open');
        btn.classList.add('expanded');
        card.classList.add('active');
        // Scroll spot into view
        setTimeout(() => {
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
    });
  });

  // Clicking the spot card itself also toggles
  document.querySelectorAll('.rd-spot-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.rd-spot-expand-btn')) return;
      const btn = card.querySelector('.rd-spot-expand-btn');
      if (btn) btn.click();
    });
  });

  /* ---- Start Journey button ----------------------- */
  document.getElementById('rd-start-btn').addEventListener('click', () => {
    const btn = document.getElementById('rd-start-btn');
    btn.textContent = '导航启动中…';
    btn.style.opacity = '0.7';
    setTimeout(() => {
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><polygon points="5,3 15,9 5,15" fill="white"/></svg> 开始旅程`;
      btn.style.opacity = '1';
    }, 1800);
  });

  /* ---- AI guide button placeholder ---------------- */
  document.getElementById('rd-ai-btn').addEventListener('click', () => {
    alert('AI导游功能即将上线，敬请期待！');
  });

})();
