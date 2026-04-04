/**
 * 城市选择页：国内城市扁平列表、热门、拼音首字母索引、北京区县。
 * 字母与 ROUTE_ADMIN_PROVINCES 中城市一一对应（用于右侧 A–Z）。
 */

import { ROUTE_ADMIN_PROVINCES } from './admin-route-cities.js';

/** 国内热门（与产品运营口径一致，可调整顺序） */
export const POPULAR_CITY_ADCODES = [
  '310000', '440100', '440300', '330100', '510100',
  '500000', '120000', '320100', '320500', '610100',
  '420100', '410100', '430100', '210100', '370200',
  '110000',
];

/** 城市 adcode → 拼音首字母（A–Z），用于分组与右侧索引 */
export const CITY_LETTER_BY_ADCODE = {
  '110000': 'B', '120000': 'T', '130100': 'S', '130200': 'T', '140100': 'T',
  '210100': 'S', '210200': 'D', '220100': 'C', '230100': 'H',
  '310000': 'S', '320100': 'N', '320500': 'S', '330100': 'H', '340100': 'H',
  '350100': 'F', '350200': 'X', '360100': 'N', '370100': 'J', '370200': 'Q',
  '410100': 'Z', '410300': 'L', '420100': 'W', '430100': 'C',
  '440100': 'G', '440300': 'S', '450100': 'N', '460100': 'H',
  '500000': 'C', '510100': 'C', '520100': 'G', '530100': 'K',
  '540100': 'L', '610100': 'X', '620100': 'L', '630100': 'X', '640100': 'Y',
  '650100': 'W',
  '810000': 'X', '820000': 'A',
};

/** 北京市下辖区县（展示用；仍归属 adcode 110000） */
export const BEIJING_DISTRICTS = [
  '东城区', '西城区', '朝阳区', '丰台区', '石景山区', '海淀区',
  '门头沟区', '房山区', '通州区', '顺义区', '昌平区', '大兴区',
  '怀柔区', '平谷区', '密云区', '延庆区',
];

const _LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * @typedef {{ adcode: string, name: string, provinceName: string, letter: string }} CatalogCity
 */

/**
 * @returns {CatalogCity[]}
 */
export function getAllCitiesFlat() {
  /** @type {CatalogCity[]} */
  const out = [];
  for (const p of ROUTE_ADMIN_PROVINCES) {
    for (const c of p.cities) {
      const letter = CITY_LETTER_BY_ADCODE[c.adcode] || c.name.charAt(0);
      out.push({
        adcode: c.adcode,
        name: c.name,
        provinceName: p.name,
        letter,
      });
    }
  }
  out.sort((a, b) => {
    if (a.letter !== b.letter) return a.letter.localeCompare(b.letter);
    return a.name.localeCompare(b.name, 'zh-CN');
  });
  return out;
}

/**
 * @param {string} q
 * @param {CatalogCity[]} flat
 */
export function filterCities(q, flat) {
  const s = (q || '').trim().toLowerCase();
  if (!s) return flat;
  return flat.filter(
    c =>
      c.name.includes(s) ||
      c.provinceName.includes(s) ||
      c.adcode.includes(s)
  );
}

/**
 * @param {CatalogCity[]} flat
 * @returns {Map<string, CatalogCity[]>}
 */
export function groupByLetter(flat) {
  /** @type {Map<string, CatalogCity[]>} */
  const m = new Map();
  for (const L of _LETTERS) m.set(L, []);
  for (const c of flat) {
    const L = _LETTERS.includes(c.letter) ? c.letter : 'Z';
    if (!m.has(L)) m.set(L, []);
    m.get(L).push(c);
  }
  return m;
}

export function getIndexLetters() {
  return _LETTERS;
}

/**
 * @param {string} parentAdcode
 * @returns {string[]}
 */
export function getDistrictsForCity(parentAdcode) {
  if (parentAdcode === '110000') return [...BEIJING_DISTRICTS];
  return [];
}

/**
 * 展示用短名：去掉「市」「特别行政区」等后缀
 * @param {string} name
 */
export function shortCityLabel(name) {
  return String(name || '')
    .replace(/特别行政区$/, '')
    .replace(/市$/, '');
}
