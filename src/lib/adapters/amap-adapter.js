/**
 * WeGO — AMapAdapter (高德地图适配器)
 *
 * 继承自 WeGOMap 抽象类，使用高德 Maps JS API 4.0 实现。
 * Sprint 1.2：只实现 init()，其余方法在后续 Task 中逐步补全。
 *
 * 使用方式：
 *   const adapter = new AMapAdapter(container, { key: 'YOUR_AMAP_KEY', securityJsCode: '...' });
 *   await adapter.init();
 */

'use strict';

import { WeGOMap } from '../wego-map-base.js';
import { haversineDistance } from '../geo-utils.js';
import { wgs84ToGcj02 } from '../coordinate-frame.js';

/* ============================================================
   常量
   ============================================================ */
/** 大栅栏杨梅竹斜街默认中心（与种子景点一致，入库 WGS-84；上高德前需转 GCJ） */
const DASHILAN_CENTER = { lng: 116.393245, lat: 39.896134 };
const DEFAULT_ZOOM    = 17;
const AMAP_SDK_URL    = 'https://webapi.amap.com/maps?v=2.0&plugin=AMap.Walking%2CAMap.Geolocation';

/* ============================================================
   工具函数
   ============================================================ */

/**
 * 动态加载高德 JS SDK 脚本（幂等：仅加载一次）
 * @param {string} apiKey         高德 Web JS API Key
 * @param {string} securityCode   高德安全密钥（JS API 2.0 必须）
 * @returns {Promise<void>}
 */
/**
 * 从高德步行规划 result 中解析 [lng,lat] 路径（兼容 routes[0].path / steps[].path）
 * @param {object|null} result
 * @returns {Array<[number, number]>|null}
 */
function extractWalkingLngLatPath(result) {
  if (!result || !result.routes || !result.routes.length) return null;
  const route = result.routes[0];
  const out = [];

  const pushPt = (pt) => {
    if (!pt) return;
    let lng;
    let lat;
    if (typeof pt.getLng === 'function' && typeof pt.getLat === 'function') {
      lng = pt.getLng();
      lat = pt.getLat();
    } else {
      lng = typeof pt.lng === 'number' ? pt.lng : pt[0];
      lat = typeof pt.lat === 'number' ? pt.lat : pt[1];
    }
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    const last = out[out.length - 1];
    if (last && last[0] === lng && last[1] === lat) return;
    out.push([lng, lat]);
  };

  if (Array.isArray(route.path) && route.path.length) {
    route.path.forEach(pushPt);
    return out.length ? out : null;
  }

  const steps = route.steps || [];
  for (let i = 0; i < steps.length; i++) {
    const p = steps[i].path;
    if (!p) continue;
    if (typeof p === 'string') {
      p.split(';').forEach((chunk) => {
        const t = chunk.trim();
        if (!t) return;
        const parts = t.split(',');
        if (parts.length >= 2) {
          const lng = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          if (Number.isFinite(lng) && Number.isFinite(lat)) pushPt({ lng, lat });
        }
      });
      continue;
    }
    if (Array.isArray(p)) {
      p.forEach(pushPt);
    }
  }
  return out.length ? out : null;
}

/**
 * 将每段步行路径的首尾锚定到游玩点 GCJ 坐标，避免路网吸附点与圆点错位
 * @param {Array<[number, number]>|null} pathLngLat [lng,lat][]
 * @param {{lat:number,lng:number}} origin
 * @param {{lat:number,lng:number}} dest
 * @returns {Array<[number, number]>}
 */
function snapSegmentPathToWaypoints(pathLngLat, origin, dest) {
  const o = [origin.lng, origin.lat];
  const d = [dest.lng, dest.lat];
  if (!pathLngLat || pathLngLat.length < 2) {
    return [o, d];
  }
  const merged = pathLngLat.map((p) => [p[0], p[1]]);
  merged[0] = [o[0], o[1]];
  merged[merged.length - 1] = [d[0], d[1]];
  return merged;
}

/** @param {[number, number]} a @param {[number, number]} b  [lng,lat] */
function nearlySameLngLat(a, b) {
  return haversineDistance(a[1], a[0], b[1], b[0]) < 0.5;
}

function loadAmapSDK(apiKey, securityCode) {
  return new Promise((resolve, reject) => {
    // 已加载则直接 resolve
    if (window.AMap) {
      resolve();
      return;
    }

    // 注入安全密钥（高德 2.0 要求在 SDK 加载前注入）
    window._AMapSecurityConfig = { securityJsCode: securityCode };

    const script  = document.createElement('script');
    script.src    = `${AMAP_SDK_URL}&key=${apiKey}`;
    script.async  = true;
    script.onload = () => {
      if (window.AMap) {
        resolve();
      } else {
        reject(new Error('[AMapAdapter] SDK 加载成功但 AMap 未挂载到 window'));
      }
    };
    script.onerror = () => reject(new Error('[AMapAdapter] 高德 SDK 脚本加载失败，请检查 API Key'));
    document.head.appendChild(script);
  });
}

/* ============================================================
   AMapAdapter
   ============================================================ */
export class AMapAdapter extends WeGOMap {
  /**
   * @param {HTMLElement} container
   * @param {{
   *   key: string,
   *   securityJsCode: string,
   *   center?: { lng: number, lat: number },
   *   zoom?: number,
   *   coordinateInput?: 'WGS84' | 'GCJ02'
   * }} options  coordinateInput 默认 WGS84（与 DB 一致）；若为 GCJ02 则不再做转换
   */
  constructor(container, options = {}) {
    super(container, options);
    /** @type {AMap.Map|null} 高德地图实例 */
    this._map = null;
    /** @type {AMap.Walking|null} 步行路线规划实例 */
    this._walking = null;
    /** @type {number|null} GPS watchPosition 的监听 ID */
    this._watchId = null;
    /** @type {Array} 已注册的围栏配置列表 */
    this._geofences = [];
    /** @type {AMap.Marker[]} 打卡勋章标记 */
    this._checkinMarkers = [];
    /** @type {AMap.Polyline[]} 步行路线折线（多次 drawRoute 前会先清除） */
    this._routePolylines = [];
  }

  /**
   * 业务层经纬度 → 高德地图/步行规划使用的 GCJ-02
   * @param {number} lat
   * @param {number} lng
   * @returns {{ lat: number, lng: number }}
   */
  _gcjFromInput(lat, lng) {
    const frame = this.options.coordinateInput ?? 'WGS84';
    if (frame === 'GCJ02') return { lat, lng };
    return wgs84ToGcj02(lat, lng);
  }

  /* ----------------------------------------------------------
     init — Sprint 1.2 实现
     加载高德 SDK → 创建地图实例 → 设置初始视角
     ---------------------------------------------------------- */
  async init() {
    const { securityJsCode, center: centerOpt = DASHILAN_CENTER, zoom = DEFAULT_ZOOM } = this.options;
    const key = this.options.key ?? this.options.apiKey;

    if (!key) {
      throw new Error('[AMapAdapter] 必须提供 options.key 或 options.apiKey (高德 API Key)');
    }
    if (!securityJsCode) {
      throw new Error('[AMapAdapter] 必须提供 options.securityJsCode (高德安全密钥)');
    }

    const center = this._gcjFromInput(centerOpt.lat, centerOpt.lng);

    // 1. 确保容器有明确的尺寸
    if (!this.container.style.height && !this.container.offsetHeight) {
      this.container.style.height = '100%';
    }

    // 2. 加载高德 SDK
    await loadAmapSDK(key, securityJsCode);

    // 3. 创建地图实例（默认标准样式；部分 Key 对 amap://styles/fresh 等主题无权限会导致瓦片空白）
    const mapOpts = {
      center:       [center.lng, center.lat],
      zoom:         zoom,
      showLabel:    true,
      lang:         'zh_cn',
      resizeEnable: true,
    };
    if (this.options.mapStyle) {
      mapOpts.mapStyle = this.options.mapStyle;
    }
    this._map = new window.AMap.Map(this.container, mapOpts);

    this._map.on('complete', () => {
      try {
        this._map.resize();
      } catch (e) {
        /* ignore */
      }
    });
    requestAnimationFrame(() => {
      try {
        this._map.resize();
      } catch (e) {
        /* ignore */
      }
    });
    setTimeout(() => {
      try {
        this._map.resize();
      } catch (e) {
        /* ignore */
      }
    }, 300);

    console.log('[AMapAdapter] ✅ 高德地图初始化完成，中心(GCJ):', center, '缩放:', zoom);
  }

  /* ----------------------------------------------------------
     setCenter — Sprint 1.3 实现
     ---------------------------------------------------------- */
  setCenter(lng, lat, zoom) {
    if (!this._map) throw new Error('[AMapAdapter] 地图未初始化，请先调用 init()');

    const g = this._gcjFromInput(lat, lng);
    this._map.setCenter([g.lng, g.lat]);
    if (zoom !== undefined) {
      this._map.setZoom(zoom);
    }
    console.log(`[AMapAdapter] setCenter → 输入 lng:${lng}, lat:${lat} → GCJ lng:${g.lng}, lat:${g.lat}, zoom:${zoom}`);
  }

  /* ----------------------------------------------------------
     fitBounds — Sprint 1.3 实现
     调整视野以完整显示给定的西南-东北边界框
     ---------------------------------------------------------- */
  fitBounds(bounds) {
    if (!this._map) throw new Error('[AMapAdapter] 地图未初始化，请先调用 init()');
    if (!bounds || !bounds.sw || !bounds.ne) {
      throw new Error('[AMapAdapter] fitBounds() 参数格式错误，期望 { sw: {lat, lng}, ne: {lat, lng} }');
    }

    const corners = [
      [bounds.sw.lat, bounds.sw.lng],
      [bounds.sw.lat, bounds.ne.lng],
      [bounds.ne.lat, bounds.sw.lng],
      [bounds.ne.lat, bounds.ne.lng],
    ];
    const gcjCorners = corners.map(([la, ln]) => this._gcjFromInput(la, ln));
    const lats = gcjCorners.map((c) => c.lat);
    const lngs = gcjCorners.map((c) => c.lng);
    const sw = { lat: Math.min(...lats), lng: Math.min(...lngs) };
    const ne = { lat: Math.max(...lats), lng: Math.max(...lngs) };

    const amapBounds = new window.AMap.Bounds(
      [sw.lng, sw.lat],
      [ne.lng, ne.lat]
    );
    this._map.setBounds(amapBounds, false, [60, 60, 60, 60]);   // padding: top/right/bottom/left
    console.log('[AMapAdapter] fitBounds →', bounds);
  }

  /* ----------------------------------------------------------
     addMarker — Sprint 1.4 实现
     在地图上添加自定义标记，支持 icon / label / onClick / checkedIn
     checkedIn 为 true 时，序号圆点右上角叠加绿色对号徽章
     ---------------------------------------------------------- */
  addMarker(lng, lat, opts = {}) {
    if (!this._map) throw new Error('[AMapAdapter] 地图未初始化，请先调用 init()');

    const { icon, label, onClick, index, checkedIn, terminal } = opts;
    const g = this._gcjFromInput(lat, lng);

    // 构建自定义标记 HTML（与 WeGO 视觉风格保持一致）
    const markerContent = document.createElement('div');
    markerContent.className = 'wego-map-marker';

    if (terminal === 'start' || terminal === 'end') {
      const chip = document.createElement('div');
      chip.className =
        terminal === 'start' ? 'wego-marker-terminal wego-marker-terminal--start' : 'wego-marker-terminal wego-marker-terminal--end';
      chip.textContent = terminal === 'start' ? '起' : '终';
      chip.setAttribute('aria-hidden', 'true');
      markerContent.appendChild(chip);
    }

    // 序号圆点
    const dot = document.createElement('div');
    dot.className = 'wego-marker-dot';
    dot.textContent = index !== undefined ? index + 1 : '';

    // 已打卡时：序号圆点内叠加对号
    if (checkedIn) {
      const badge = document.createElement('div');
      badge.className = 'wego-marker-checked-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = '✓';
      dot.appendChild(badge);
      dot.classList.add('is-checked');
    }

    markerContent.appendChild(dot);

    const marker = new window.AMap.Marker({
      position:  [g.lng, g.lat],
      content:   markerContent,
      offset:    new window.AMap.Pixel(-16, -16),
      anchor:    'bottom-center',
    });

    if (onClick) {
      marker.on('click', () => onClick({ lng, lat, ...opts }));
    }

    marker.setMap(this._map);
    console.log(`[AMapAdapter] addMarker → 输入 WGS lng:${lng}, lat:${lat} → GCJ 展示 lng:${g.lng}, lat:${g.lat}, label:"${label || ''}", checkedIn:${!!checkedIn}`);
    return marker;
  }

  /* ----------------------------------------------------------
     addCheckinMarker — Sprint 6.3 打卡勋章
     ---------------------------------------------------------- */
  addCheckinMarker(lng, lat, opts = {}) {
    if (!this._map) throw new Error('[AMapAdapter] 地图未初始化，请先调用 init()');

    const { label, onClick } = opts;
    const g = this._gcjFromInput(lat, lng);
    const wrap = document.createElement('div');
    wrap.className = 'wego-checkin-marker';
    const medal = document.createElement('div');
    medal.className = 'wego-checkin-medal';
    medal.setAttribute('aria-hidden', 'true');
    medal.textContent = '✓';
    wrap.appendChild(medal);
    if (label) {
      const lab = document.createElement('div');
      lab.className = 'wego-checkin-label';
      lab.textContent = label;
      wrap.appendChild(lab);
    }

    const marker = new window.AMap.Marker({
      position: [g.lng, g.lat],
      content: wrap,
      offset: new window.AMap.Pixel(-22, -22),
      anchor: 'bottom-center',
      zIndex: 120,
    });
    if (onClick) marker.on('click', () => onClick({ lng, lat }));
    marker.setMap(this._map);
    this._checkinMarkers.push(marker);
    console.log(`[AMapAdapter] addCheckinMarker → GCJ lng:${g.lng}, lat:${g.lat}`);
    return marker;
  }

  /* ----------------------------------------------------------
     drawRoute — Sprint 1.5 实现
     按景点顺序逐段调用高德步行路线规划，合并为一条最短步行网路径并绘制。
     不传 map 给 Walking，自行解析 steps/path，避免多段 search 时仅保留最后一段覆盖物。
     coords: [ {lat, lng}, {lat, lng}, ... ]  至少 2 个点
     style:  { color, weight, opacity }
     ---------------------------------------------------------- */
  _clearRoutePolylines() {
    this._routePolylines.forEach((pl) => {
      try {
        pl.setMap(null);
      } catch (e) {
        /* ignore */
      }
    });
    this._routePolylines = [];
  }

  async drawRoute(coords, style = {}) {
    if (!this._map) throw new Error('[AMapAdapter] 地图未初始化，请先调用 init()');
    if (!Array.isArray(coords) || coords.length < 2) {
      throw new Error('[AMapAdapter] drawRoute() 需要至少 2 个坐标点');
    }

    /** 与标记一致：WGS→GCJ 后再请求步行规划，折线与圆点同一坐标系 */
    const gcjCoords = coords.map((c) => {
      const g = this._gcjFromInput(c.lat, c.lng);
      return { lat: g.lat, lng: g.lng };
    });

    const {
      color   = '#6C5CE7',   // WeGO 品牌紫
      weight  = 5,
      opacity = 0.85,
    } = style;

    this._clearRoutePolylines();

    // 确保 AMap.Walking 插件已加载
    await new Promise((resolve) => {
      window.AMap.plugin('AMap.Walking', resolve);
    });

    /**
     * 绑定 map 的 Walking 在多数环境下比 map:null 更稳定（null 易返回 error）。
     * 每段 search 后在回调里 clear，避免默认折线残留；最终只保留我们合并后的 Polyline。
     */
    let walking;
    try {
      walking = new window.AMap.Walking({
        map: this._map,
        hideMarkers: true,
      });
    } catch (e) {
      try {
        walking = new window.AMap.Walking({ map: this._map });
      } catch (e2) {
        console.warn('[AMapAdapter] Walking({map}) 构造失败，回退无 map', e2);
        try {
          walking = new window.AMap.Walking({ map: null });
        } catch (e3) {
          walking = new window.AMap.Walking();
        }
      }
    }
    this._walking = walking;

    const planSegment = (origin, destination) =>
      new Promise((resolve) => {
        walking.search(
          [origin.lng, origin.lat],
          [destination.lng, destination.lat],
          (status, result) => {
            try {
              if (typeof walking.clear === 'function') {
                walking.clear();
              }
            } catch (clearErr) {
              /* ignore */
            }
            if (status === 'complete' && result && result.routes && result.routes.length) {
              resolve(result);
              return;
            }
            const info = result && (result.info || result.message || result);
            console.warn(
              `[AMapAdapter] 步行路线规划失败（${status}）${info ? ` detail:${String(info)}` : ''}，该段将用直线连接`,
              result || ''
            );
            resolve(null);
          }
        );
      });

    const drawPolylinePath = (pathLngLat) => {
      const line = new window.AMap.Polyline({
        map:           this._map,
        path:          pathLngLat,
        strokeColor:   color,
        strokeWeight:  weight,
        strokeOpacity: opacity,
        lineJoin:      'round',
        lineCap:       'round',
      });
      this._routePolylines.push(line);
    };

    const drawFallbackPolyline = () => {
      const path = gcjCoords.map((c) => [c.lng, c.lat]);
      drawPolylinePath(path);
      console.log('[AMapAdapter] drawRoute → 降级绘制直连折线，共', gcjCoords.length, '个途经点');
    };

    const merged = [];

    const appendSegmentPath = (segmentPath, fallbackOrigin, fallbackDest) => {
      if (segmentPath && segmentPath.length >= 2) {
        if (merged.length === 0) {
          merged.push(...segmentPath);
        } else {
          const last = merged[merged.length - 1];
          const first = segmentPath[0];
          if (nearlySameLngLat(last, first)) {
            merged.push(...segmentPath.slice(1));
          } else {
            merged.push(...segmentPath);
          }
        }
        return;
      }
      const a = fallbackOrigin;
      const b = fallbackDest;
      const line = [[a.lng, a.lat], [b.lng, b.lat]];
      if (merged.length === 0) {
        merged.push(...line);
      } else {
        const last = merged[merged.length - 1];
        if (!nearlySameLngLat(last, line[0])) {
          merged.push(line[0]);
        }
        merged.push(line[1]);
      }
    };

    let anyApiOk = false;
    for (let i = 0; i < gcjCoords.length - 1; i++) {
      const result = await planSegment(gcjCoords[i], gcjCoords[i + 1]);
      const rawPath = result ? extractWalkingLngLatPath(result) : null;
      if (rawPath && rawPath.length >= 2) anyApiOk = true;
      const segPath = snapSegmentPathToWaypoints(rawPath, gcjCoords[i], gcjCoords[i + 1]);
      appendSegmentPath(segPath, gcjCoords[i], gcjCoords[i + 1]);
    }

    if (merged.length < 2) {
      drawFallbackPolyline();
      console.warn(
        '[AMapAdapter] drawRoute：无法合并步行路径，已用直线连接（请检查 Key 与域名白名单）'
      );
      return;
    }

    try {
      if (this._walking && typeof this._walking.clear === 'function') {
        this._walking.clear();
      }
    } catch (e) {
      /* ignore */
    }

    drawPolylinePath(merged);

    if (!anyApiOk) {
      console.warn(
        '[AMapAdapter] drawRoute：步行规划均未返回路径数据，已用直线连接',
        gcjCoords.length - 1,
        '段'
      );
    } else {
      console.log('[AMapAdapter] drawRoute ✅ 已合并步行路网', gcjCoords.length - 1, '段（GCJ，与标记一致）');
    }
  }

  /* ----------------------------------------------------------
     addGeofence — Sprint 1.6 实现
     结合 haversineDistance + 浏览器 watchPosition 实现圆形围栏判定。
     返回 { stop() } 对象以便取消围栏监听。
     ---------------------------------------------------------- */
  addGeofence(lng, lat, radius, onEnter) {
    if (!navigator.geolocation) {
      console.warn('[AMapAdapter] addGeofence: 当前环境不支持 Geolocation API');
      return { stop: () => {} };
    }

    // 记录围栏内状态，避免重复触发
    const fence = { lng, lat, radius, onEnter, isInside: false };
    this._geofences.push(fence);

    // 如果还没有全局 watchPosition，就启动一个共用的监听器管理所有围栏
    if (this._watchId === null) {
      this._watchId = navigator.geolocation.watchPosition(
        (position) => { this._onGPSUpdate(position); },
        (err)      => { console.warn('[AMapAdapter] GPS 获取失败:', err.message); },
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
      );
      console.log('[AMapAdapter] GPS watchPosition 已启动，watchId:', this._watchId);
    }

    // 返回 stop() 接口
    return {
      stop: () => {
        const idx = this._geofences.indexOf(fence);
        if (idx !== -1) this._geofences.splice(idx, 1);
        console.log('[AMapAdapter] 围栏已移除，剩余:', this._geofences.length);
      }
    };
  }

  /**
   * 内部 GPS 更新处理器：遍历所有围栏并判定进出
   * @param {GeolocationPosition} position
   * @private
   */
  _onGPSUpdate(position) {
    const userLat = position.coords.latitude;
    const userLng = position.coords.longitude;

    this._geofences.forEach(fence => {
      const dist = haversineDistance(userLat, userLng, fence.lat, fence.lng);
      const nowInside = dist <= fence.radius;

      if (nowInside && !fence.isInside) {
        fence.isInside = true;
        console.log(`[AMapAdapter] 📍 进入围栏: lat=${fence.lat}, lng=${fence.lng}, 距离=${dist.toFixed(1)}m`);
        if (typeof fence.onEnter === 'function') {
          fence.onEnter({ lat: fence.lat, lng: fence.lng, distanceMeters: dist });
        }
      } else if (!nowInside && fence.isInside) {
        fence.isInside = false;
        console.log(`[AMapAdapter] 📍 离开围栏: lat=${fence.lat}, lng=${fence.lng}, 距离=${dist.toFixed(1)}m`);
      }
    });
  }

  /* ----------------------------------------------------------
     destroy
     ---------------------------------------------------------- */
  destroy() {
    this._clearRoutePolylines();
    if (this._watchId !== null) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
    this._checkinMarkers.forEach((m) => {
      try {
        m.setMap(null);
      } catch (e) {
        /* ignore */
      }
    });
    this._checkinMarkers = [];
    if (this._map) {
      this._map.destroy();
      this._map = null;
    }
    console.log('[AMapAdapter] 地图实例已销毁');
  }
}
