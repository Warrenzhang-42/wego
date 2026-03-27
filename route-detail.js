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


  /* ---- Elements ----------------------------------- */
  const mapWrapper     = document.getElementById('rd-map-wrapper');
  const mapSvg         = document.getElementById('rd-map-svg');
  const tooltip        = document.getElementById('map-spot-tooltip');
  const detailPanel    = document.getElementById('rd-detail-panel');
  const statsWrapper    = document.querySelector('.rd-stats-wrapper');
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
