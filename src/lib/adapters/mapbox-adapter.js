/**
 * WeGO Map Adapter — mapbox-adapter.js
 * 
 * Mapbox GL JS 适配器实现。
 * 遵循 WeGOMap 接口契约，确保与 AMap 等引擎互通。
 * 
 * Sprint 1.8 — Mapbox 基本接入
 */

'use strict';

import { WeGOMap } from '../wego-map-base.js';
import { haversineDistance } from '../geo-utils.js';

export class MapboxAdapter extends WeGOMap {
  constructor(container, options = {}) {
    super(container, options);
    this.map = null;
    this.markers = [];
    this.checkinMarkers = [];
    this.routeLayers = [];
    this.watchId = null;
    this.fences = [];
  }

  /**
   * 初始化 Mapbox GL JS
   */
  async init() {
    if (!this.options.apiKey) {
      throw new Error('MapboxAdapter 需要 apiKey (accessToken)');
    }

    // 1. 动态加载 SDK
    await this._loadSDK();

    // 2. 初始化地图实例
    mapboxgl.accessToken = this.options.apiKey;
    this.map = new mapboxgl.Map({
      container: this.container,
      style: 'mapbox://styles/mapbox/streets-v12', // 默认街景样式
      center: [116.397428, 39.90923], // 北京中心
      zoom: 15,
      ...this.options.mapOptions
    });

    return new Promise((resolve) => {
      this.map.on('load', () => {
        console.log('Mapbox initialized.');
        resolve();
      });
    });
  }

  /**
   * 加载 Mapbox SDK 脚本与样式
   */
  _loadSDK() {
    return new Promise((resolve, reject) => {
      // 避免重复加载
      if (window.mapboxgl) return resolve();

      // CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.1.2/mapbox-gl.css';
      document.head.appendChild(link);

      // JS
      const script = document.createElement('script');
      script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.1.2/mapbox-gl.js';
      script.async = true;
      script.onload = () => {
        // 等待 mapboxgl 挂载到 window
        const check = setInterval(() => {
          if (window.mapboxgl) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      };
      script.onerror = () => reject(new Error('Mapbox SDK 加载失败'));
      document.head.appendChild(script);
    });
  }

  setCenter(lng, lat, zoom) {
    if (!this.map) return;
    this.map.jumpTo({
      center: [lng, lat],
      zoom: zoom || this.map.getZoom()
    });
  }

  fitBounds(bounds) {
    if (!this.map || !bounds) return;
    // Mapbox fitBounds 接收 [[west, south], [east, north]]
    this.map.fitBounds([
      [bounds.sw.lng, bounds.sw.lat],
      [bounds.ne.lng, bounds.ne.lat]
    ], { padding: 50, duration: 1000 });
  }

  /**
   * 添加自定义样式的 Marker，支持 checkedIn：已打卡时序号圆点右上角叠加绿色对号
   */
  addMarker(lng, lat, opts = {}) {
    if (!this.map) return;

    // 创建自定义 DOM 元素以模拟 AMap 的样式
    const el = document.createElement('div');
    el.className = 'wego-map-marker';

    const dot = document.createElement('div');
    dot.className = 'wego-marker-dot';
    dot.textContent = opts.label || (opts.index !== undefined ? opts.index + 1 : '');

    if (opts.checkedIn) {
      const badge = document.createElement('div');
      badge.className = 'wego-marker-checked-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = '\u2713';
      dot.appendChild(badge);
      dot.classList.add('is-checked');
    }

    el.appendChild(dot);

    const pointer = document.createElement('div');
    pointer.className = 'wego-marker-pointer';
    pointer.setAttribute('aria-hidden', 'true');
    el.appendChild(pointer);

    if (opts.onClick) {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onClick();
      });
    }

    const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([lng, lat])
      .addTo(this.map);

    this.markers.push(marker);
    return marker;
  }

  addCheckinMarker(lng, lat, opts = {}) {
    if (!this.map) return;

    const el = document.createElement('div');
    el.className = 'wego-checkin-marker';
    el.innerHTML = `
      <div class="wego-checkin-medal">✓</div>
      ${opts.label ? `<div class="wego-checkin-label">${opts.label}</div>` : ''}
    `;
    if (opts.onClick) {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onClick();
      });
    }

    const marker = new mapboxgl.Marker(el)
      .setLngLat([lng, lat])
      .addTo(this.map);
    this.checkinMarkers.push(marker);
    return marker;
  }

  /**
   * 绘制路线 (GeoJSON Source + Line Layer)
   */
  async drawRoute(coords, style = {}) {
    if (!this.map || !coords || coords.length < 2) return;

    const layerId = `route-${Date.now()}`;
    const sourceId = `route-source-${Date.now()}`;

    const geojsonData = {
      'type': 'Feature',
      'properties': {},
      'geometry': {
        'type': 'LineString',
        'coordinates': coords.map(c => [c.lng, c.lat])
      }
    };

    this.map.addSource(sourceId, {
      'type': 'geojson',
      'data': geojsonData
    });

    this.map.addLayer({
      'id': layerId,
      'type': 'line',
      'source': sourceId,
      'layout': {
        'line-join': 'round',
        'line-cap': 'round'
      },
      'paint': {
        'line-color': style.color || '#6C5CE7',
        'line-width': style.weight || 5,
        'line-opacity': 0.8
      }
    });

    this.routeLayers.push({ layerId, sourceId });
  }

  /**
   * 地理围栏实现 (逻辑与 AMapAdapter 类似，保持行为一致)
   */
  addGeofence(lng, lat, radius, onEnter) {
    const fence = { lng, lat, radius, onEnter, triggered: false };
    this.fences.push(fence);

    if (this.watchId === null) {
      this._startLocationWatch();
    }

    return {
      stop: () => {
        this.fences = this.fences.filter(f => f !== fence);
        if (this.fences.length === 0 && this.watchId !== null) {
          navigator.geolocation.clearWatch(this.watchId);
          this.watchId = null;
        }
      }
    };
  }

  _startLocationWatch() {
    if (!navigator.geolocation) return;
    
    this.watchId = navigator.geolocation.watchPosition((pos) => {
      const uLng = pos.coords.longitude;
      const uLat = pos.coords.latitude;

      this.fences.forEach(f => {
        const dist = haversineDistance(uLat, uLng, f.lat, f.lng);
        if (dist <= f.radius) {
          if (!f.triggered) {
            f.triggered = true;
            f.onEnter();
          }
        } else {
          f.triggered = false;
        }
      });
    }, (err) => console.error('Geofence positioning error:', err), {
      enableHighAccuracy: true,
      maximumAge: 5000
    });
  }

  destroy() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.checkinMarkers.forEach((m) => {
      try {
        m.remove();
      } catch (e) {
        /* ignore */
      }
    });
    this.checkinMarkers = [];
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.markers = [];
    this.routeLayers = [];
  }
}
