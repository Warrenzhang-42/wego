/**
 * 后台「轮播页管理」— 通用 / 地区分区；图片与路线混合列表、先选类型再添加、横向拖拽排序
 */
import { adminApi } from './lib/admin-api.js';
import { ROUTE_ADMIN_PROVINCES, formatCityLabel } from './lib/admin-route-cities.js';

function toast(type, message) {
  if (typeof window.toast === 'function') window.toast(type, message);
  else console.log(`[carousel-admin] ${type}: ${message}`);
}

function announceCarousel(message) {
  const el = document.getElementById('carousel-a11y-live');
  if (!el || !message) return;
  el.textContent = '';
  requestAnimationFrame(() => {
    el.textContent = message;
  });
}

/** @param {HTMLButtonElement | null} btn @param {boolean} pending @param {string} [pendingLabel] */
function setBtnPending(btn, pending, pendingLabel = '处理中…') {
  if (!btn) return;
  if (pending) {
    if (btn.dataset.carouselOrigText == null) btn.dataset.carouselOrigText = btn.textContent || '';
    btn.disabled = true;
    btn.classList.add('btn--pending');
    btn.textContent = pendingLabel;
  } else {
    btn.disabled = false;
    btn.classList.remove('btn--pending');
    if (btn.dataset.carouselOrigText != null) {
      btn.textContent = btn.dataset.carouselOrigText;
      delete btn.dataset.carouselOrigText;
    }
  }
}

function setCarouselPageBusy(busy) {
  const root = document.getElementById('admin-view-carousel');
  if (root) root.setAttribute('aria-busy', busy ? 'true' : 'false');
}

function formatCarouselApiError(err, action) {
  const msg = String(err && err.message ? err.message : err);
  if (/home_carousel_configs|home_carousel_city_groups/i.test(msg) && (/schema cache|does not exist|Could not find/i.test(msg))) {
    return (
      '数据库中还没有轮播相关表。请依次在 Supabase SQL Editor 执行 server/migrations/011_home_carousel_configs.sql 与 server/migrations/013_home_carousel_city_groups.sql 全文后刷新。' +
      (action ? `（${action}）` : '')
    );
  }
  return msg;
}

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @type {{ generalItems: object[], regionalItems: object[], regionalGroupId: string | null, groupsList: { id: string, name: string, city_adcodes: string[] }[], routeTitles: Record<string, string> }} */
const S = {
  generalItems: [],
  regionalItems: [],
  regionalGroupId: null,
  groupsList: [],
  routeTitles: {},
};

function allCityOptions() {
  const out = [];
  for (const p of ROUTE_ADMIN_PROVINCES) {
    for (const c of p.cities) {
      out.push({ adcode: c.adcode, label: `${p.name} · ${c.name}` });
    }
  }
  return out;
}

async function prefetchTitlesForItems(items) {
  const ids = items.filter((i) => i.type === 'route' && i.route_id).map((i) => i.route_id);
  const uniq = [...new Set(ids)];
  await Promise.all(
    uniq.map(async (id) => {
      if (S.routeTitles[id]) return;
      try {
        const r = await adminApi.getRouteAdmin(id);
        S.routeTitles[id] = r.title || id;
      } catch {
        S.routeTitles[id] = id;
      }
    })
  );
}

function reorderItemsByUnifiedStrip(items, container) {
  if (!container) return items;
  const cards = [...container.querySelectorAll('.carousel-item-card--draggable')];
  if (!cards.length) return items;
  const next = cards
    .map((el) => {
      const i = parseInt(el.dataset.itemIndex, 10);
      return items[i];
    })
    .filter((x) => x != null);
  if (next.length !== items.length) return items;
  return next;
}

function getDragAfterCardForStrip(container, x) {
  const cards = [...container.querySelectorAll('.carousel-item-card--draggable:not(.is-dragging)')];
  let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
  for (const child of cards) {
    const box = child.getBoundingClientRect();
    const mid = box.left + box.width / 2;
    const offset = x - mid;
    if (offset < 0 && offset > closest.offset) {
      closest = { offset, element: child };
    }
  }
  return closest.element;
}

/** 在横向统一列表上事件委托（图片 + 路线混合排序），只绑定一次 */
function wireUnifiedStripDelegation(zoneId, getItems, setItems, renderFn) {
  const zone = document.getElementById(zoneId);
  if (!zone || zone.dataset.carouselUnifiedDrag === '1') return;
  zone.dataset.carouselUnifiedDrag = '1';

  let dragCard = null;

  zone.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.carousel-item-card--draggable');
    if (!card || !zone.contains(card)) return;
    const interactive = e.target.closest('input, button, textarea, select, label, a');
    if (interactive && card.contains(interactive)) {
      e.preventDefault();
      return;
    }
    dragCard = card;
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', 'carousel-reorder');
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => card.classList.add('is-dragging'));
  });

  zone.addEventListener('dragend', () => {
    if (dragCard) dragCard.classList.remove('is-dragging');
    dragCard = null;
    const items = getItems();
    const next = reorderItemsByUnifiedStrip(items, zone);
    setItems(next);
    renderFn();
    announceCarousel(`顺序已更新，共 ${next.length} 项，请保存。`);
  });

  zone.addEventListener('dragover', (e) => {
    if (!dragCard) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const after = getDragAfterCardForStrip(zone, e.clientX);
    if (after == null) {
      zone.appendChild(dragCard);
    } else {
      zone.insertBefore(dragCard, after);
    }
  });

  zone.addEventListener('drop', (e) => e.preventDefault());
}

const DRAG_ICON_SVG = `<svg class="carousel-item-card__drag-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>`;

function renderUnifiedStrip(items, stripEl, prefix, onRemove, onAltChange) {
  if (!stripEl) return;
  if (!items.length) {
    stripEl.innerHTML =
      '<p class="carousel-unified-strip__empty-hint" role="status">还没有内容。请先在上方选「图片」或「推荐路线」，添加后再拖动卡片排序。</p>';
    return;
  }
  stripEl.innerHTML = items
    .map((it, idx) => {
      if (it.type === 'image') {
        const url = it.image_url || '';
        return `
        <div class="spot-card carousel-item-card carousel-item-card--image carousel-item-card--draggable spot-card--draggable" draggable="true" data-item-index="${idx}">
          <div class="spot-card__header">
            <span class="carousel-item-card__drag-hint" title="拖动排序">${DRAG_ICON_SVG}</span>
            <span class="spot-card__order">${idx + 1}</span>
            <span class="spot-card__name">图片</span>
          </div>
          <div class="spot-card__thumb">
            <img src="${esc(url)}" alt="" draggable="false" loading="lazy" onerror="this.style.display='none'">
          </div>
          <div class="spot-card__subtitle" style="font-size:11px;word-break:break-all;max-height:2.8em;overflow:hidden;">${esc(url)}</div>
          <input type="text" class="form-input" style="margin-top:6px;font-size:12px;" data-${prefix}-img-alt="${idx}" placeholder="简单说说这张图在展示什么（可不填）" value="${esc(it.alt || '')}" autocomplete="off">
          <button type="button" class="btn btn-sm btn-danger" style="margin-top:8px;width:100%;" data-${prefix}-item-remove="${idx}">移除</button>
        </div>`;
      }
      if (it.type === 'route') {
        const title = S.routeTitles[it.route_id] || it.route_id;
        return `
        <div class="spot-card carousel-item-card carousel-item-card--route carousel-item-card--draggable spot-card--draggable" draggable="true" data-item-index="${idx}" data-route-id="${esc(it.route_id)}">
          <div class="spot-card__header">
            <span class="carousel-item-card__drag-hint" title="拖动排序">${DRAG_ICON_SVG}</span>
            <span class="spot-card__order">${idx + 1}</span>
            <span class="spot-card__name">${esc(title)}</span>
          </div>
          <div class="spot-card__subtitle" style="font-size:11px;color:#9ca3af;">${esc(it.route_id)}</div>
          <button type="button" class="btn btn-sm btn-danger" style="margin-top:8px;width:100%;" data-${prefix}-item-remove="${idx}">移除</button>
        </div>`;
      }
      return '';
    })
    .join('');

  stripEl.querySelectorAll(`[data-${prefix}-img-alt]`).forEach((inp) => {
    const syncAlt = () => {
      const i = parseInt(inp.getAttribute(`data-${prefix}-img-alt`), 10);
      onAltChange(i, inp.value.trim());
    };
    inp.addEventListener('input', syncAlt);
  });
  stripEl.querySelectorAll(`[data-${prefix}-item-remove]`).forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.getAttribute(`data-${prefix}-item-remove`), 10);
      onRemove(i);
    });
  });
}

function syncCarouselAddMode(prefix) {
  const imageWrap = document.getElementById(`${prefix}-add-image-wrap`);
  const routeWrap = document.getElementById(`${prefix}-add-route-wrap`);
  const name = `${prefix}-add-mode`;
  const mode = document.querySelector(`input[name="${name}"]:checked`)?.value || 'image';
  if (imageWrap) imageWrap.hidden = mode !== 'image';
  if (routeWrap) routeWrap.hidden = mode !== 'route';
}

function initCoverPicker(prefix, onAddImageUrl) {
  const root = document.getElementById(`${prefix}-cover-picker`);
  if (!root) return;

  root.querySelectorAll('.cover-picker__tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const name = tab.getAttribute('data-tab');
      root.querySelectorAll('.cover-picker__tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      root.querySelectorAll('.cover-picker__panel').forEach((p) => {
        p.classList.toggle('active', p.getAttribute('data-panel') === name);
      });
    });
  });

  const urlIn = document.getElementById(`${prefix}-url-in`);
  const urlApply = document.getElementById(`${prefix}-url-apply`);
  function applyUrlFromInput() {
    const u = (urlIn && urlIn.value.trim()) || '';
    if (!u) {
      toast('error', '请先填写图片链接');
      return;
    }
    onAddImageUrl(u);
    if (urlIn) urlIn.value = '';
    urlIn?.focus();
  }

  urlApply?.addEventListener('click', applyUrlFromInput);
  urlIn?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyUrlFromInput();
    }
  });

  const dropZone = document.getElementById(`${prefix}-drop-zone`);
  const fileInput = document.getElementById(`${prefix}-file`);
  const hint = document.getElementById(`${prefix}-drop-hint`);
  const uploading = document.getElementById(`${prefix}-uploading`);

  dropZone?.addEventListener('click', () => fileInput?.click());
  dropZone?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput?.click();
    }
  });

  async function handleFiles(files) {
    const f = files && files[0];
    if (!f || !f.type.startsWith('image/')) {
      toast('error', '请选择 JPG / PNG / WebP 图片');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast('error', '单张图片不超过 5MB');
      return;
    }
    if (hint) hint.style.display = 'none';
    if (uploading) uploading.style.display = '';
    try {
      const url = await adminApi.uploadCarouselImage(f);
      onAddImageUrl(url);
      toast('success', '已上传并添加');
    } catch (e) {
      toast('error', `上传失败：${e.message}`);
    } finally {
      if (hint) hint.style.display = '';
      if (uploading) uploading.style.display = 'none';
      if (fileInput) fileInput.value = '';
    }
  }

  dropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });
  fileInput?.addEventListener('change', () => handleFiles(fileInput.files));
}

function renderNewRegionSelectedPreview(selectEl, previewEl) {
  if (!previewEl) return;
  const selected = selectEl ? [...selectEl.selectedOptions].map((o) => o.value).filter(Boolean) : [];
  if (!selected.length) {
    previewEl.innerHTML = '<p class="text-sm text-muted" style="margin:0;">尚未选择城市，请在上方列表中多选。</p>';
    return;
  }
  previewEl.innerHTML = selected
    .map(
      (ad) =>
        `<span class="carousel-city-chip carousel-city-chip--static">${esc(formatCityLabel(ad) || ad)}</span>`
    )
    .join('');
}

export function initAdminCarouselPanel() {
  const genUnifiedStrip = document.getElementById('carousel-gen-unified-strip');
  const regUnifiedStrip = document.getElementById('carousel-reg-unified-strip');
  const newGroupCities = document.getElementById('carousel-new-group-cities');
  const newRegionPanel = document.getElementById('carousel-new-region-panel');
  const newRegionToggle = document.getElementById('carousel-toggle-new-region');
  const newRegionPreview = document.getElementById('carousel-new-region-selected-preview');
  const regMembersWrap = document.getElementById('carousel-reg-members-wrap');
  const regAddCitySel = document.getElementById('carousel-reg-add-city-select');
  const regEditor = document.getElementById('carousel-reg-editor');

  function fillCityMultiSelect(el) {
    if (!el) return;
    el.innerHTML = '';
    for (const o of allCityOptions()) {
      const opt = document.createElement('option');
      opt.value = o.adcode;
      opt.textContent = o.label;
      el.appendChild(opt);
    }
  }

  function usedAdcodesInGroups() {
    const set = new Set();
    for (const g of S.groupsList) {
      for (const ad of g.city_adcodes || []) set.add(ad);
    }
    return set;
  }

  function fillAddCityDropdown() {
    if (!regAddCitySel) return;
    const used = usedAdcodesInGroups();
    regAddCitySel.innerHTML = '<option value="">选择城市加入当前地区…</option>';
    for (const o of allCityOptions()) {
      if (used.has(o.adcode)) continue;
      const opt = document.createElement('option');
      opt.value = o.adcode;
      opt.textContent = o.label;
      regAddCitySel.appendChild(opt);
    }
  }

  function renderGroupChrome() {
    const g = S.groupsList.find((x) => x.id === S.regionalGroupId);

    if (regMembersWrap) {
      if (!g || !(g.city_adcodes || []).length) {
        regMembersWrap.innerHTML =
          '<p class="text-sm text-muted" style="margin:0;">当前地区暂无城市，可从下方添加。</p>';
      } else {
        regMembersWrap.innerHTML = g.city_adcodes
          .map(
            (ad) =>
              `<span class="carousel-city-chip" data-adcode="${esc(ad)}">${esc(formatCityLabel(ad) || ad)}` +
              `<button type="button" class="carousel-city-chip-remove" data-remove-ad="${esc(ad)}" aria-label="从该地区移除">×</button></span>`
          )
          .join('');
        regMembersWrap.querySelectorAll('[data-remove-ad]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const ad = btn.getAttribute('data-remove-ad');
            if (!S.regionalGroupId || !ad) return;
            if (!confirm(`从该地区移除「${formatCityLabel(ad) || ad}」？该城市将删除独立轮播配置并回退为通用轮播。`)) return;
            try {
              await adminApi.removeCityFromCarouselGroup(S.regionalGroupId, ad);
              if (!S.groupsList.some((x) => x.id === S.regionalGroupId)) {
                S.regionalGroupId = null;
              }
              toast('success', '已移除');
              await refreshUi();
            } catch (e) {
              toast('error', formatCarouselApiError(e, '移除城市'));
            }
          });
        });
      }
    }

    fillAddCityDropdown();
  }

  async function loadRegionalItemsForCurrentGroup() {
    if (!S.regionalGroupId) {
      S.regionalItems = [];
      return;
    }
    const g = S.groupsList.find((x) => x.id === S.regionalGroupId);
    if (!g || !(g.city_adcodes || []).length) {
      S.regionalItems = [];
      return;
    }
    const first = g.city_adcodes[0];
    const row = await adminApi.getCarouselConfig(`city:${first}`);
    S.regionalItems = row && Array.isArray(row.items) ? JSON.parse(JSON.stringify(row.items)) : [];
  }

  const regionsListEl = document.getElementById('carousel-regions-list');
  const regionsListEmpty = document.getElementById('carousel-regions-list-empty');
  const regionDetailWrap = document.getElementById('carousel-region-detail-wrap');

  async function selectRegionalGroup(groupId) {
    if (!groupId || groupId === S.regionalGroupId) return;
    S.regionalGroupId = groupId;
    await loadRegionalItemsForCurrentGroup();
    await prefetchTitlesForItems(S.regionalItems);
    renderRegionsList();
    renderGroupChrome();
    renderRegional();
    const gi = S.groupsList.findIndex((g) => g.id === groupId);
    if (gi >= 0) announceCarousel(`已切换到地区 ${gi + 1}`);
  }

  /** 地区卡片内城市预览：过多时只展示前几名并标注总数 */
  const REGION_CARD_CITIES_PREVIEW = 3;

  function formatRegionCardCitiesHtml(group) {
    const codes = group.city_adcodes || [];
    if (!codes.length) {
      return '<span class="carousel-region-card__cities-empty">暂无城市，可在下方加入</span>';
    }
    const labels = codes.map((ad) => formatCityLabel(ad) || ad);
    if (labels.length <= REGION_CARD_CITIES_PREVIEW) {
      return `<span class="carousel-region-card__cities-text">${esc(labels.join('、'))}</span>`;
    }
    const head = labels.slice(0, REGION_CARD_CITIES_PREVIEW).join('、');
    return `<span class="carousel-region-card__cities-text">${esc(head)}…</span><span class="carousel-region-card__cities-count">等共 ${labels.length} 个城市</span>`;
  }

  function regionCardTitleAttr(group) {
    const codes = group.city_adcodes || [];
    if (!codes.length) return '';
    const full = codes.map((ad) => formatCityLabel(ad) || ad).join('、');
    return ` title="${esc(full)}"`;
  }

  function renderRegionsList() {
    if (!regionsListEl || !regionsListEmpty || !regionDetailWrap) return;
    const hasGroups = S.groupsList.length > 0;
    regionsListEmpty.hidden = hasGroups;
    regionDetailWrap.hidden = !hasGroups;
    if (!hasGroups) {
      regionsListEl.innerHTML = '';
      return;
    }
    regionsListEl.innerHTML = S.groupsList
      .map((g, idx) => {
        const active = g.id === S.regionalGroupId;
        const cityBlock = formatRegionCardCitiesHtml(g);
        const tip = regionCardTitleAttr(g);
        return `
        <div role="listitem">
          <button type="button" class="carousel-region-card${active ? ' carousel-region-card--active' : ''}" data-carousel-select-group="${esc(g.id)}"${tip} aria-pressed="${active ? 'true' : 'false'}" aria-label="地区 ${idx + 1}，${active ? '当前正在编辑' : '点击切换到此地区'}">
            <div class="carousel-region-card__head">
              <span class="carousel-region-card__title">地区 ${idx + 1}</span>
              <span class="carousel-region-card__badge">${active ? '当前编辑' : '点击切换'}</span>
            </div>
            <div class="carousel-region-card__cities">${cityBlock}</div>
          </button>
        </div>`;
      })
      .join('');
    regionsListEl.querySelectorAll('[data-carousel-select-group]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-carousel-select-group');
        if (id) selectRegionalGroup(id);
      });
    });
  }

  async function loadAllFromDb() {
    await adminApi.reconcileOrphanCityCarouselConfigs();
    const rows = await adminApi.listCarouselConfigs();
    const genRow = rows.find((r) => r.config_key === 'general');
    S.generalItems = genRow && Array.isArray(genRow.items) ? JSON.parse(JSON.stringify(genRow.items)) : [];

    S.groupsList = await adminApi.listCarouselCityGroups();

    if (!S.regionalGroupId || !S.groupsList.some((g) => g.id === S.regionalGroupId)) {
      S.regionalGroupId = S.groupsList[0]?.id || null;
    }

    await loadRegionalItemsForCurrentGroup();
    renderGroupChrome();
    renderRegionsList();

    await prefetchTitlesForItems(S.generalItems);
    await prefetchTitlesForItems(S.regionalItems);
  }

  function renderGeneral() {
    renderUnifiedStrip(
      S.generalItems,
      genUnifiedStrip,
      'gen',
      (i) => {
        S.generalItems.splice(i, 1);
        renderGeneral();
      },
      (i, alt) => {
        if (S.generalItems[i] && S.generalItems[i].type === 'image') S.generalItems[i].alt = alt;
      }
    );
  }

  function renderRegional() {
    const g = S.groupsList.find((x) => x.id === S.regionalGroupId);
    const hasGroup = Boolean(S.regionalGroupId && g && (g.city_adcodes || []).length);
    if (regEditor) regEditor.hidden = !hasGroup;
    if (!hasGroup) {
      if (regUnifiedStrip) regUnifiedStrip.innerHTML = '';
      return;
    }

    renderUnifiedStrip(
      S.regionalItems,
      regUnifiedStrip,
      'reg',
      (i) => {
        S.regionalItems.splice(i, 1);
        renderRegional();
      },
      (i, alt) => {
        if (S.regionalItems[i] && S.regionalItems[i].type === 'image') S.regionalItems[i].alt = alt;
      }
    );
  }

  async function refreshUi() {
    setCarouselPageBusy(true);
    try {
      await loadAllFromDb();
      renderGeneral();
      renderRegional();
    } catch (e) {
      toast('error', formatCarouselApiError(e, '加载'));
    } finally {
      setCarouselPageBusy(false);
    }
  }

  fillCityMultiSelect(newGroupCities);
  renderNewRegionSelectedPreview(newGroupCities, newRegionPreview);
  newGroupCities?.addEventListener('change', () => renderNewRegionSelectedPreview(newGroupCities, newRegionPreview));

  function setNewRegionPanelOpen(open) {
    if (!newRegionPanel || !newRegionToggle) return;
    newRegionPanel.hidden = !open;
    newRegionToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  newRegionToggle?.addEventListener('click', () => {
    const next = newRegionPanel?.hidden !== false;
    setNewRegionPanelOpen(next);
    if (next) {
      requestAnimationFrame(() => {
        newGroupCities?.focus();
      });
    }
  });

  document.querySelectorAll('input[name="carousel-gen-add-mode"]').forEach((r) => {
    r.addEventListener('change', () => syncCarouselAddMode('carousel-gen'));
  });
  document.querySelectorAll('input[name="carousel-reg-add-mode"]').forEach((r) => {
    r.addEventListener('change', () => syncCarouselAddMode('carousel-reg'));
  });
  syncCarouselAddMode('carousel-gen');
  syncCarouselAddMode('carousel-reg');

  initCoverPicker('carousel-gen', (url) => {
    S.generalItems.push({ type: 'image', image_url: url, alt: '' });
    renderGeneral();
  });

  initCoverPicker('carousel-reg', (url) => {
    S.regionalItems.push({ type: 'image', image_url: url, alt: '' });
    renderRegional();
  });

  document.getElementById('carousel-gen-add-route')?.addEventListener('click', () => {
    const sel = document.getElementById('carousel-gen-route-pick');
    const id = sel && sel.value;
    if (!id) {
      toast('error', '请先选一条路线');
      return;
    }
    S.generalItems.push({ type: 'route', route_id: id });
    prefetchTitlesForItems(S.generalItems).then(() => {
      if (sel) sel.value = '';
      renderGeneral();
    });
  });

  document.getElementById('carousel-reg-add-route')?.addEventListener('click', () => {
    const sel = document.getElementById('carousel-reg-route-pick');
    const id = sel && sel.value;
    if (!id) {
      toast('error', '请先选一条路线');
      return;
    }
    S.regionalItems.push({ type: 'route', route_id: id });
    prefetchTitlesForItems(S.regionalItems).then(() => {
      if (sel) sel.value = '';
      renderRegional();
    });
  });

  wireUnifiedStripDelegation(
    'carousel-gen-unified-strip',
    () => S.generalItems,
    (v) => {
      S.generalItems = v;
    },
    renderGeneral
  );
  wireUnifiedStripDelegation(
    'carousel-reg-unified-strip',
    () => S.regionalItems,
    (v) => {
      S.regionalItems = v;
    },
    renderRegional
  );

  const btnSaveGeneral = document.getElementById('carousel-save-general');
  btnSaveGeneral?.addEventListener('click', async () => {
    S.generalItems = reorderItemsByUnifiedStrip(S.generalItems, genUnifiedStrip);
    setBtnPending(btnSaveGeneral, true, '保存中…');
    try {
      await adminApi.upsertCarouselConfig('general', S.generalItems);
      toast('success', '通用轮播已保存');
      announceCarousel('通用轮播已保存');
      await refreshUi();
    } catch (e) {
      toast('error', formatCarouselApiError(e, '保存通用'));
    } finally {
      setBtnPending(btnSaveGeneral, false);
    }
  });

  const btnSaveRegional = document.getElementById('carousel-save-regional');
  btnSaveRegional?.addEventListener('click', async () => {
    if (!S.regionalGroupId) return;
    S.regionalItems = reorderItemsByUnifiedStrip(S.regionalItems, regUnifiedStrip);
    setBtnPending(btnSaveRegional, true, '保存中…');
    try {
      await adminApi.saveCarouselCityGroupItems(S.regionalGroupId, S.regionalItems);
      toast('success', '地区轮播已保存');
      announceCarousel('地区轮播已保存');
      await refreshUi();
    } catch (e) {
      toast('error', formatCarouselApiError(e, '保存地区轮播'));
    } finally {
      setBtnPending(btnSaveRegional, false);
    }
  });

  const btnCreateRegion = document.getElementById('carousel-new-group-create');
  btnCreateRegion?.addEventListener('click', async () => {
    const selected = newGroupCities ? [...newGroupCities.selectedOptions].map((o) => o.value).filter(Boolean) : [];
    if (!selected.length) {
      toast('error', '请先多选至少一个城市');
      return;
    }
    setBtnPending(btnCreateRegion, true, '创建中…');
    try {
      const grp = await adminApi.createCarouselCityGroup('', selected);
      S.regionalGroupId = grp.id;
      if (newGroupCities) newGroupCities.selectedIndex = -1;
      renderNewRegionSelectedPreview(newGroupCities, newRegionPreview);
      toast('success', '地区已创建');
      announceCarousel('地区已创建');
      setNewRegionPanelOpen(false);
      await refreshUi();
    } catch (e) {
      toast('error', formatCarouselApiError(e, '创建地区'));
    } finally {
      setBtnPending(btnCreateRegion, false);
    }
  });

  const btnRegAddCity = document.getElementById('carousel-reg-add-city-btn');
  btnRegAddCity?.addEventListener('click', async () => {
    if (!S.regionalGroupId || !regAddCitySel) return;
    const ad = regAddCitySel.value;
    if (!ad) {
      toast('error', '请先选择要加入的城市');
      return;
    }
    setBtnPending(btnRegAddCity, true, '加入中…');
    try {
      await adminApi.addCityToCarouselGroup(S.regionalGroupId, ad);
      regAddCitySel.value = '';
      toast('success', '城市已加入该地区');
      announceCarousel('城市已加入当前地区');
      await refreshUi();
    } catch (e) {
      toast('error', formatCarouselApiError(e, '加入城市'));
    } finally {
      setBtnPending(btnRegAddCity, false);
    }
  });

  const pickGen = document.getElementById('carousel-gen-route-pick');
  const pickReg = document.getElementById('carousel-reg-route-pick');
  for (const sel of [pickGen, pickReg]) {
    if (!sel) continue;
    sel.innerHTML = '<option value="">加载路线列表中…</option>';
    sel.disabled = true;
  }
  adminApi
    .getRoutesAdmin({ page: 1, pageSize: 500 })
    .then(({ data }) => {
      for (const sel of [pickGen, pickReg]) {
        if (!sel) continue;
        sel.disabled = false;
        sel.innerHTML = '<option value="">选一条路线…</option>';
        for (const r of data) {
          const o = document.createElement('option');
          o.value = r.id;
          o.textContent = `${r.title || r.id}（${r.city_adcode || '—'}）`;
          sel.appendChild(o);
        }
      }
    })
    .catch((e) => {
      for (const sel of [pickGen, pickReg]) {
        if (!sel) continue;
        sel.disabled = false;
        sel.innerHTML = '<option value="">路线加载失败，请刷新页面</option>';
      }
      toast('error', e.message);
    });

  refreshUi();
}
