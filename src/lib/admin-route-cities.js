/**
 * 管理后台「所在城市」省/市联动与 WGS-84 粗略边界校验。
 * 边界为行政范围近似矩形（非精密多边形），与数据库存储坐标系一致（WGS-84）。
 */

'use strict';

/** @typedef {{ adcode: string, name: string, s: number, w: number, n: number, e: number }} AdminCity */

/** @type {{ code: string, name: string, cities: AdminCity[] }[]} */
export const ROUTE_ADMIN_PROVINCES = [
  {
    code: '11',
    name: '北京',
    cities: [{ adcode: '110000', name: '北京市', s: 39.44, w: 115.42, n: 41.06, e: 117.51 }],
  },
  {
    code: '12',
    name: '天津',
    cities: [{ adcode: '120000', name: '天津市', s: 38.55, w: 116.7, n: 40.25, e: 118.05 }],
  },
  {
    code: '31',
    name: '上海',
    cities: [{ adcode: '310000', name: '上海市', s: 30.68, w: 120.85, n: 31.92, e: 122.12 }],
  },
  {
    code: '50',
    name: '重庆',
    cities: [{ adcode: '500000', name: '重庆市', s: 28.15, w: 105.28, n: 32.22, e: 110.2 }],
  },
  {
    code: '13',
    name: '河北',
    cities: [
      { adcode: '130100', name: '石家庄市', s: 37.88, w: 113.98, n: 38.45, e: 114.68 },
      { adcode: '130200', name: '唐山市', s: 38.98, w: 117.95, n: 40.28, e: 119.35 },
    ],
  },
  {
    code: '14',
    name: '山西',
    cities: [{ adcode: '140100', name: '太原市', s: 37.55, w: 112.38, n: 38.22, e: 113.15 }],
  },
  {
    code: '21',
    name: '辽宁',
    cities: [
      { adcode: '210100', name: '沈阳市', s: 41.5, w: 122.95, n: 42.28, e: 123.7 },
      { adcode: '210200', name: '大连市', s: 38.82, w: 121.38, n: 39.15, e: 121.9 },
    ],
  },
  {
    code: '22',
    name: '吉林',
    cities: [{ adcode: '220100', name: '长春市', s: 43.52, w: 124.8, n: 44.45, e: 125.85 }],
  },
  {
    code: '23',
    name: '黑龙江',
    cities: [{ adcode: '230100', name: '哈尔滨市', s: 45.2, w: 125.95, n: 46.68, e: 127.5 }],
  },
  {
    code: '32',
    name: '江苏',
    cities: [
      { adcode: '320100', name: '南京市', s: 31.15, w: 118.37, n: 32.62, e: 119.2 },
      { adcode: '320500', name: '苏州市', s: 30.76, w: 119.95, n: 32.0, e: 121.2 },
    ],
  },
  {
    code: '33',
    name: '浙江',
    cities: [{ adcode: '330100', name: '杭州市', s: 29.97, w: 118.35, n: 30.58, e: 120.65 }],
  },
  {
    code: '34',
    name: '安徽',
    cities: [{ adcode: '340100', name: '合肥市', s: 31.23, w: 116.8, n: 32.2, e: 117.9 }],
  },
  {
    code: '35',
    name: '福建',
    cities: [
      { adcode: '350100', name: '福州市', s: 25.72, w: 118.98, n: 26.45, e: 119.75 },
      { adcode: '350200', name: '厦门市', s: 24.42, w: 117.78, n: 24.95, e: 118.52 },
    ],
  },
  {
    code: '36',
    name: '江西',
    cities: [{ adcode: '360100', name: '南昌市', s: 28.45, w: 115.48, n: 29.08, e: 116.38 }],
  },
  {
    code: '37',
    name: '山东',
    cities: [
      { adcode: '370100', name: '济南市', s: 36.22, w: 116.6, n: 37.08, e: 117.6 },
      { adcode: '370200', name: '青岛市', s: 35.96, w: 119.3, n: 36.42, e: 120.95 },
    ],
  },
  {
    code: '41',
    name: '河南',
    cities: [
      { adcode: '410100', name: '郑州市', s: 34.16, w: 112.95, n: 34.72, e: 114.02 },
      { adcode: '410300', name: '洛阳市', s: 33.98, w: 111.85, n: 34.75, e: 112.75 },
    ],
  },
  {
    code: '42',
    name: '湖北',
    cities: [{ adcode: '420100', name: '武汉市', s: 30.35, w: 113.7, n: 31.37, e: 115.08 }],
  },
  {
    code: '43',
    name: '湖南',
    cities: [{ adcode: '430100', name: '长沙市', s: 27.98, w: 112.38, n: 28.68, e: 113.3 }],
  },
  {
    code: '44',
    name: '广东',
    cities: [
      { adcode: '440100', name: '广州市', s: 22.77, w: 112.95, n: 23.93, e: 114.08 },
      { adcode: '440300', name: '深圳市', s: 22.45, w: 113.75, n: 22.87, e: 114.63 },
    ],
  },
  {
    code: '45',
    name: '广西',
    cities: [{ adcode: '450100', name: '南宁市', s: 22.63, w: 107.95, n: 23.48, e: 108.9 }],
  },
  {
    code: '46',
    name: '海南',
    cities: [{ adcode: '460100', name: '海口市', s: 19.95, w: 110.1, n: 20.28, e: 110.55 }],
  },
  {
    code: '51',
    name: '四川',
    cities: [{ adcode: '510100', name: '成都市', s: 30.1, w: 102.95, n: 31.43, e: 104.9 }],
  },
  {
    code: '52',
    name: '贵州',
    cities: [{ adcode: '520100', name: '贵阳市', s: 26.35, w: 106.55, n: 27.05, e: 107.1 }],
  },
  {
    code: '53',
    name: '云南',
    cities: [{ adcode: '530100', name: '昆明市', s: 24.88, w: 102.48, n: 25.45, e: 103.2 }],
  },
  {
    code: '61',
    name: '陕西',
    cities: [{ adcode: '610100', name: '西安市', s: 33.65, w: 108.38, n: 34.8, e: 109.9 }],
  },
  {
    code: '62',
    name: '甘肃',
    cities: [{ adcode: '620100', name: '兰州市', s: 35.95, w: 103.25, n: 36.75, e: 104.15 }],
  },
  {
    code: '63',
    name: '青海',
    cities: [{ adcode: '630100', name: '西宁市', s: 36.43, w: 101.55, n: 37.05, e: 102.1 }],
  },
  {
    code: '64',
    name: '宁夏',
    cities: [{ adcode: '640100', name: '银川市', s: 37.85, w: 105.85, n: 38.55, e: 106.65 }],
  },
  {
    code: '65',
    name: '新疆',
    cities: [{ adcode: '650100', name: '乌鲁木齐市', s: 42.95, w: 86.95, n: 44.05, e: 88.38 }],
  },
  {
    code: '54',
    name: '西藏',
    cities: [{ adcode: '540100', name: '拉萨市', s: 29.35, w: 90.95, n: 30.22, e: 92.55 }],
  },
  {
    code: '81',
    name: '香港',
    cities: [{ adcode: '810000', name: '香港特别行政区', s: 22.15, w: 113.82, n: 22.57, e: 114.41 }],
  },
  {
    code: '82',
    name: '澳门',
    cities: [{ adcode: '820000', name: '澳门特别行政区', s: 22.1, w: 113.53, n: 22.22, e: 113.59 }],
  },
];

const _byAdcode = new Map();
for (const p of ROUTE_ADMIN_PROVINCES) {
  for (const c of p.cities) {
    _byAdcode.set(c.adcode, { ...c, provinceName: p.name });
  }
}

/**
 * @param {string} adcode
 * @returns {AdminCity & { provinceName: string } | undefined}
 */
export function getCityMeta(adcode) {
  if (!adcode) return undefined;
  return _byAdcode.get(String(adcode));
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {AdminCity} box
 */
export function isWgs84InCityBox(lat, lng, box) {
  return lat >= box.s && lat <= box.n && lng >= box.w && lng <= box.e;
}

/**
 * 根据 WGS-84 坐标匹配首个覆盖该点的城市（边界为近似矩形，跨省交界可能存在歧义，以列表遍历顺序为准）。
 * @param {number} lat
 * @param {number} lng
 * @returns {AdminCity & { provinceName: string; provinceCode: string } | null}
 */
export function resolveCityFromWgs84(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  for (const p of ROUTE_ADMIN_PROVINCES) {
    for (const c of p.cities) {
      if (isWgs84InCityBox(lat, lng, c)) {
        return { ...c, provinceName: p.name, provinceCode: p.code };
      }
    }
  }
  return null;
}

/**
 * @param {Array<{ name?: string, lat?: unknown, lng?: unknown }>} spots
 * @param {string} cityAdcode
 * @returns {string[]} 越界景点名称
 */
export function listSpotNamesOutsideCity(spots, cityAdcode) {
  const meta = getCityMeta(cityAdcode);
  if (!meta) return [];

  const outside = [];
  for (const s of spots || []) {
    const lat = Number(s.lat);
    const lng = Number(s.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!isWgs84InCityBox(lat, lng, meta)) {
      outside.push(s.name && String(s.name).trim() ? String(s.name) : '（未命名景点）');
    }
  }
  return outside;
}

/**
 * @param {string} cityAdcode
 * @returns {string | undefined} 用于列表展示的「省 · 市」
 */
export function formatCityLabel(cityAdcode) {
  const m = getCityMeta(cityAdcode);
  if (!m) return undefined;
  return `${m.provinceName} · ${m.name}`;
}
