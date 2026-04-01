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

import { WeGOMap } from '../map-adapter.js';
import { haversineDistance } from '../geo-utils.js';

/* ============================================================
   常量
   ============================================================ */
/** 大栅栏杨梅竹斜街默认中心坐标（GCJ-02） */
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
   *   zoom?: number
   * }} options
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
  }

  /* ----------------------------------------------------------
     init — Sprint 1.2 实现
     加载高德 SDK → 创建地图实例 → 设置初始视角
     ---------------------------------------------------------- */
  async init() {
    const { securityJsCode, center = DASHILAN_CENTER, zoom = DEFAULT_ZOOM } = this.options;
    const key = this.options.key ?? this.options.apiKey;

    if (!key) {
      throw new Error('[AMapAdapter] 必须提供 options.key 或 options.apiKey (高德 API Key)');
    }
    if (!securityJsCode) {
      throw new Error('[AMapAdapter] 必须提供 options.securityJsCode (高德安全密钥)');
    }

    // 1. 确保容器有明确的尺寸
    if (!this.container.style.height && !this.container.offsetHeight) {
      this.container.style.height = '100%';
    }

    // 2. 加载高德 SDK
    await loadAmapSDK(key, securityJsCode);

    // 3. 创建地图实例
    this._map = new window.AMap.Map(this.container, {
      center:     [center.lng, center.lat],
      zoom:       zoom,
      mapStyle:   'amap://styles/fresh',   // 清新风格，与 WeGO 设计调性一致
      showLabel:  true,
      lang:       'zh_cn',
      resizeEnable: true,
    });

    console.log('[AMapAdapter] ✅ 高德地图初始化完成，中心:', center, '缩放:', zoom);
  }

  /* ----------------------------------------------------------
     setCenter — Sprint 1.3 实现
     ---------------------------------------------------------- */
  setCenter(lng, lat, zoom) {
    if (!this._map) throw new Error('[AMapAdapter] 地图未初始化，请先调用 init()');

    this._map.setCenter([lng, lat]);
    if (zoom !== undefined) {
      this._map.setZoom(zoom);
    }
    console.log(`[AMapAdapter] setCenter → lng:${lng}, lat:${lat}, zoom:${zoom}`);
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

    const amapBounds = new window.AMap.Bounds(
      [bounds.sw.lng, bounds.sw.lat],   // 西南角
      [bounds.ne.lng, bounds.ne.lat]    // 东北角
    );
    this._map.setBounds(amapBounds, false, [60, 60, 60, 60]);   // padding: top/right/bottom/left
    console.log('[AMapAdapter] fitBounds →', bounds);
  }

  /* ----------------------------------------------------------
     addMarker — Sprint 1.4 实现
     在地图上添加自定义标记，支持 icon / label / onClick
     ---------------------------------------------------------- */
  addMarker(lng, lat, opts = {}) {
    if (!this._map) throw new Error('[AMapAdapter] 地图未初始化，请先调用 init()');

    const { icon, label, onClick, index } = opts;

    // 构建自定义标记 HTML（与 WeGO 视觉风格保持一致）
    const markerContent = document.createElement('div');
    markerContent.className = 'wego-map-marker';

    // 序号圆点
    const dot = document.createElement('div');
    dot.className = 'wego-marker-dot';
    dot.textContent = index !== undefined ? index + 1 : '';
    markerContent.appendChild(dot);

    // 标签（显示景点名称）
    if (label) {
      const labelEl = document.createElement('div');
      labelEl.className = 'wego-marker-label';
      labelEl.textContent = label;
      markerContent.appendChild(labelEl);
    }

    const marker = new window.AMap.Marker({
      position:  [lng, lat],
      content:   markerContent,
      offset:    new window.AMap.Pixel(-16, -16),
      anchor:    'bottom-center',
    });

    if (onClick) {
      marker.on('click', () => onClick({ lng, lat, ...opts }));
    }

    marker.setMap(this._map);
    console.log(`[AMapAdapter] addMarker → lng:${lng}, lat:${lat}, label:"${label || ''}"`);
    return marker;
  }

  /* ----------------------------------------------------------
     drawRoute — Sprint 1.5 实现
     逐段调用高德步行路线规划 API，将 polyline 绘制到地图上
     coords: [ {lat, lng}, {lat, lng}, ... ]  至少 2 个点
     style:  { color, weight, opacity }
     ---------------------------------------------------------- */
  async drawRoute(coords, style = {}) {
    if (!this._map) throw new Error('[AMapAdapter] 地图未初始化，请先调用 init()');
    if (!Array.isArray(coords) || coords.length < 2) {
      throw new Error('[AMapAdapter] drawRoute() 需要至少 2 个坐标点');
    }

    const {
      color   = '#6C5CE7',   // WeGO 品牌紫
      weight  = 5,
      opacity = 0.85,
    } = style;

    // 确保 AMap.Walking 插件已加载
    await new Promise((resolve) => {
      window.AMap.plugin('AMap.Walking', resolve);
    });

    const walking = new window.AMap.Walking({ map: this._map });
    this._walking = walking;

    // 逐段规划步行路线（起点→途经点→终点）
    const planSegment = (origin, destination) =>
      new Promise((resolve, reject) => {
        walking.search(
          [origin.lng, origin.lat],
          [destination.lng, destination.lat],
          (status, result) => {
            if (status === 'complete') {
              resolve(result);
            } else {
              console.warn(`[AMapAdapter] 步行路线规划失败（${status}），将使用直线连接`);
              resolve(null);   // 降级处理：不阻断流程
            }
          }
        );
      });

    // 若 Walking 路线规划失败，降级绘制直连折线
    const drawFallbackPolyline = () => {
      const path = coords.map(c => [c.lng, c.lat]);
      new window.AMap.Polyline({
        map:         this._map,
        path:        path,
        strokeColor: color,
        strokeWeight: weight,
        strokeOpacity: opacity,
        lineJoin:    'round',
        lineCap:     'round',
      });
      console.log('[AMapAdapter] drawRoute → 降级绘制直连折线，共', coords.length, '个点');
    };

    // 依次规划各段
    let allFailed = true;
    for (let i = 0; i < coords.length - 1; i++) {
      const result = await planSegment(coords[i], coords[i + 1]);
      if (result) allFailed = false;
    }

    if (allFailed) {
      drawFallbackPolyline();
    }

    console.log('[AMapAdapter] drawRoute ✅ 共', coords.length - 1, '段路线');
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
    if (this._watchId !== null) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
    if (this._map) {
      this._map.destroy();
      this._map = null;
    }
    console.log('[AMapAdapter] 地图实例已销毁');
  }
}
