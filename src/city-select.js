import {
  getCityMeta,
  resolveCityFromWgs84,
} from './lib/admin-route-cities.js';
import {
  saveCityFromPicker,
  getStoredAdcodeRaw,
  getCityVisitHistory,
  getStoredDistrictName,
  DEFAULT_CITY_ADCODE,
} from './lib/city-preference.js';
import {
  getAllCitiesFlat,
  filterCities,
  groupByLetter,
  getIndexLetters,
  getDistrictsForCity,
  POPULAR_CITY_ADCODES,
  shortCityLabel,
} from './lib/city-select-catalog.js';

function goBack() {
  const ret = sessionStorage.getItem('wego_city_select_return') || 'index.html';
  sessionStorage.removeItem('wego_city_select_return');
  window.location.href = ret;
}

document.getElementById('cs-close')?.addEventListener('click', goBack);

/**
 * @returns {Promise<{ lat: number, lng: number } | null>}
 */
function getCurrentPositionWgs84() {
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 120000, timeout: 12000 }
    );
  });
}

/**
 * @param {string} adcode
 * @param {string} [district]
 */
function pickCity(adcode, district) {
  saveCityFromPicker(adcode, district);
  goBack();
}

/**
 * @param {string} adcode
 * @param {string} [district]
 * @param {string} currentAd
 * @param {string} currentD
 */
function isCurrent(adcode, district, currentAd, currentD) {
  const d = district || '';
  return adcode === currentAd && (d || '') === (currentD || '');
}

function renderChip(container, opts) {
  const {
    label,
    onClick,
    isLoc,
    isCurrent,
  } = opts;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cs-chip';
  if (isLoc) btn.classList.add('cs-chip--loc');
  if (isCurrent) btn.classList.add('cs-chip--current');
  if (isLoc) {
    btn.innerHTML = `<span class="cs-pin" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 0.5C4.5 0.5 2.5 2.5 2.5 5C2.5 8.5 7 13.5 7 13.5C7 13.5 11.5 8.5 11.5 5C11.5 2.5 9.5 0.5 7 0.5ZM7 6.5C6.2 6.5 5.5 5.8 5.5 5C5.5 4.2 6.2 3.5 7 3.5C7.8 3.5 8.5 4.2 8.5 5C8.5 5.8 7.8 6.5 7 6.5Z" fill="currentColor"/></svg></span><span>${label}</span>`;
  } else {
    btn.textContent = label;
  }
  btn.addEventListener('click', onClick);
  container.appendChild(btn);
}

const flatAll = getAllCitiesFlat();

function setupDistrictSection(currentAd, currentD) {
  const section = document.getElementById('cs-district-section');
  const heading = document.getElementById('cs-district-heading');
  const grid = document.getElementById('cs-district-grid');
  const wrap = document.getElementById('cs-district-wrap');
  const expandBtn = document.getElementById('cs-district-expand');
  const expandLabel = document.getElementById('cs-expand-label');
  if (!section || !heading || !grid || !wrap || !expandBtn) return;

  const meta = getCityMeta(currentAd);
  const districts = getDistrictsForCity(currentAd);

  if (!meta || districts.length === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  heading.textContent = `所选${shortCityLabel(meta.name)}的相关市/区/县`;

  grid.innerHTML = '';
  for (const name of districts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cs-chip';
    if (isCurrent(currentAd, name, currentAd, currentD)) {
      btn.classList.add('cs-chip--current');
    }
    btn.textContent = name;
    btn.addEventListener('click', () => pickCity(currentAd, name));
    grid.appendChild(btn);
  }

  const needsExpand = districts.length > 8;
  expandBtn.hidden = !needsExpand;
  if (needsExpand) {
    wrap.classList.add('is-collapsed');
    let open = false;
    expandBtn.classList.remove('is-open');
    expandLabel.textContent = '展开';
    expandBtn.onclick = () => {
      open = !open;
      wrap.classList.toggle('is-collapsed', !open);
      expandBtn.classList.toggle('is-open', open);
      expandLabel.textContent = open ? '收起' : '展开';
    };
  } else {
    wrap.classList.remove('is-collapsed');
    expandBtn.onclick = null;
  }
}

function setupPopular(currentAd, currentD) {
  const el = document.getElementById('cs-popular');
  if (!el) return;
  el.innerHTML = '';
  for (const ad of POPULAR_CITY_ADCODES) {
    const m = getCityMeta(ad);
    if (!m) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cs-chip';
    if (isCurrent(ad, '', currentAd, currentD)) btn.classList.add('cs-chip--current');
    btn.textContent = shortCityLabel(m.name);
    btn.addEventListener('click', () => pickCity(ad, ''));
    el.appendChild(btn);
  }
}

function setupLetterGroups(flat, currentAd, currentD) {
  const host = document.getElementById('cs-letter-groups');
  if (!host) return;
  host.innerHTML = '';
  const grouped = groupByLetter(flat);
  for (const L of getIndexLetters()) {
    const cities = grouped.get(L);
    if (!cities || cities.length === 0) continue;
    const block = document.createElement('div');
    block.className = 'cs-letter-block';
    block.id = `cs-jump-${L}`;
    block.dataset.letter = L;

    const lab = document.createElement('div');
    lab.className = 'cs-letter-label';
    lab.textContent = L;
    block.appendChild(lab);

    const grid = document.createElement('div');
    grid.className = 'cs-grid';
    for (const c of cities) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cs-chip';
      if (isCurrent(c.adcode, '', currentAd, currentD)) {
        btn.classList.add('cs-chip--current');
      }
      btn.textContent = shortCityLabel(c.name);
      btn.addEventListener('click', () => pickCity(c.adcode, ''));
      grid.appendChild(btn);
    }
    block.appendChild(grid);
    host.appendChild(block);
  }
}

function setupRail(lettersPresent) {
  const rail = document.getElementById('cs-rail');
  if (!rail) return;
  rail.querySelectorAll('[data-jump]').forEach(n => {
    if (n.getAttribute('data-jump') !== 'top') n.remove();
  });
  for (const L of lettersPresent) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cs-rail-item';
    b.textContent = L;
    b.dataset.jump = L;
    rail.appendChild(b);
  }

  const scrollEl = document.getElementById('cs-scroll');
  rail.addEventListener('click', e => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const jump = t.closest('[data-jump]')?.getAttribute('data-jump');
    if (!jump || !scrollEl) return;
    if (jump === 'top') {
      scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const target = document.getElementById(`cs-jump-${jump}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

function setupSearch(flat) {
  const input = document.getElementById('cs-search-input');
  const panelMain = document.getElementById('cs-panel-main');
  const panelSearch = document.getElementById('cs-search-panel');
  const grid = document.getElementById('cs-search-grid');
  const empty = document.getElementById('cs-search-empty');
  const rail = document.getElementById('cs-rail');
  if (!input || !panelMain || !panelSearch || !grid) return;

  let t = 0;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = window.setTimeout(() => {
      const q = input.value.trim();
      if (!q) {
        panelMain.hidden = false;
        panelSearch.hidden = true;
        if (rail) rail.style.visibility = '';
        return;
      }
      const found = filterCities(q, flat);
      panelMain.hidden = true;
      panelSearch.hidden = false;
      if (rail) rail.style.visibility = 'hidden';
      grid.innerHTML = '';
      grid.className = 'cs-grid cs-grid--search';
      if (!found.length) {
        empty.hidden = false;
        return;
      }
      empty.hidden = true;
      for (const c of found) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cs-chip';
        btn.textContent = `${c.name} · ${c.provinceName}`;
        btn.addEventListener('click', () => pickCity(c.adcode, ''));
        grid.appendChild(btn);
      }
    }, 120);
  });
}

(async function init() {
  const currentAd = getStoredAdcodeRaw() || DEFAULT_CITY_ADCODE;
  const currentD = getStoredDistrictName();

  const locBox = document.getElementById('cs-loc-history');
  if (locBox) {
    locBox.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'cs-chip cs-chip--loc';
    loading.innerHTML =
      '<span class="cs-pin" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 0.5C4.5 0.5 2.5 2.5 2.5 5C2.5 8.5 7 13.5 7 13.5C7 13.5 11.5 8.5 11.5 5C11.5 2.5 9.5 0.5 7 0.5ZM7 6.5C6.2 6.5 5.5 5.8 5.5 5C5.5 4.2 6.2 3.5 7 3.5C7.8 3.5 8.5 4.2 8.5 5C8.5 5.8 7.8 6.5 7 6.5Z" fill="currentColor"/></svg></span><span>定位中…</span>';
    locBox.appendChild(loading);

    const pos = await getCurrentPositionWgs84();
    const det = pos ? resolveCityFromWgs84(pos.lat, pos.lng) : null;
    locBox.innerHTML = '';

    const locLabel = det
      ? shortCityLabel(getCityMeta(det.adcode)?.name || '当前')
      : '重新定位';
    renderChip(locBox, {
      label: locLabel,
      isLoc: true,
      isCurrent: det
        ? isCurrent(det.adcode, '', currentAd, currentD)
        : false,
      onClick: async () => {
        if (det) {
          pickCity(det.adcode, '');
          return;
        }
        const p2 = await getCurrentPositionWgs84();
        const d2 = p2 ? resolveCityFromWgs84(p2.lat, p2.lng) : null;
        if (d2) pickCity(d2.adcode, '');
      },
    });

    const hist = getCityVisitHistory();
    for (const h of hist) {
      const m = getCityMeta(h.adcode);
      if (!m) continue;
      const dist = h.district || '';
      const label = dist
        ? `${shortCityLabel(m.name)} ${dist}`
        : shortCityLabel(m.name);
      renderChip(locBox, {
        label,
        isLoc: false,
        isCurrent: isCurrent(h.adcode, dist, currentAd, currentD),
        onClick: () => pickCity(h.adcode, dist),
      });
    }
  }

  setupDistrictSection(currentAd, currentD);
  setupPopular(currentAd, currentD);
  setupLetterGroups(flatAll, currentAd, currentD);

  const grouped = groupByLetter(flatAll);
  const lettersPresent = getIndexLetters().filter(L => (grouped.get(L) || []).length > 0);
  setupRail(lettersPresent);

  setupSearch(flatAll);
})();
