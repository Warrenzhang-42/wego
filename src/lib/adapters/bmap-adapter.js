/**
 * WeGO Map Adapter — bmap-adapter.js
 * 
 * 百度地图 JS API v3.0 适配器实现。
 * 处理 GCJ-02 到 BD-09 的坐标转换。
 * 
 * Sprint 1.9 — 百度地图接入
 */

'use strict';

import { WeGOMap } from '../wego-map-base.js';
import { haversineDistance } from '../geo-utils.js';

export class BMapAdapter extends WeGOMap {
  constructor(container, options = {}) {
    super(container, options);
    this.map = null;
    this.markers = [];
    this.checkinOverlays = [];
    this.watchId = null;
    this.fences = [];
  }

  /**
   * 初始化百度地图
   */
  async init() {
    if (!this.options.apiKey) {
      throw new Error('BMapAdapter 需要 apiKey (ak)');
    }

    await this._loadSDK();

    // 百度地图构造函数是异步加载的，SDK 加载完后 BMap 变量可用
    this.map = new BMap.Map(this.container);
    this.map.centerAndZoom(new BMap.Point(116.404, 39.915), 15);
    this.map.enableScrollWheelZoom(true);

    console.log('BMap initialized.');
  }

  _loadSDK() {
    return new Promise((resolve, reject) => {
      if (window.BMap) return resolve();

      const script = document.createElement('script');
      // 百度地图 v3.0
      script.src = `https://api.map.baidu.com/api?v=3.0&ak=${this.options.apiKey}&callback=onBMapLibLoad`;
      
      // 百度地图需要全局回调
      window.onBMapLibLoad = () => {
        resolve();
      };

      script.onerror = () => reject(new Error('BMap SDK 加载失败'));
      document.head.appendChild(script);
    });
  }

  /**
   * 坐标转换：GCJ-02 -> BD-09
   */
  _gcj02ToBd09(lng, lat) {
    const x_PI = (3.14159265358979324 * 3000.0) / 180.0;
    const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * x_PI);
    const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * x_PI);
    const bd_lng = z * Math.cos(theta) + 0.0065;
    const bd_lat = z * Math.sin(theta) + 0.006;
    return [bd_lng, bd_lat];
  }

  setCenter(lng, lat, zoom) {
    if (!this.map) return;
    const [blng, blat] = this._gcj02ToBd09(lng, lat);
    const point = new BMap.Point(blng, blat);
    this.map.centerAndZoom(point, zoom || this.map.getZoom());
  }

  fitBounds(bounds) {
    if (!this.map || !bounds) return;
    const [sw_lng, sw_lat] = this._gcj02ToBd09(bounds.sw.lng, bounds.sw.lat);
    const [ne_lng, ne_lat] = this._gcj02ToBd09(bounds.ne.lng, bounds.ne.lat);
    
    const b_bounds = new BMap.Bounds(
      new BMap.Point(sw_lng, sw_lat),
      new BMap.Point(ne_lng, ne_lat)
    );
    this.map.setViewport(b_bounds);
  }

  addMarker(lng, lat, opts = {}) {
    if (!this.map) return;

    const [blng, blat] = this._gcj02ToBd09(lng, lat);
    const point = new BMap.Point(blng, blat);
    
    // 百度地图自定义 Overlay 较复杂，先用 Label + Marker 组合模拟
    const marker = new BMap.Marker(point);
    this.map.addOverlay(marker);

    if (opts.label || opts.title) {
        const label = new BMap.Label(opts.title || opts.label, {
            offset: new BMap.Size(20, -10)
        });
        label.setStyle({
            color: "#fff",
            backgroundColor: "rgba(20, 15, 40, 0.8)",
            border: "none",
            borderRadius: "4px",
            padding: "2px 6px",
            fontSize: "12px"
        });
        marker.setLabel(label);
    }

    if (opts.onClick) {
      marker.addEventListener('click', opts.onClick);
    }

    this.markers.push(marker);
    return marker;
  }

  addCheckinMarker(lng, lat, opts = {}) {
    if (!this.map) return;

    const [blng, blat] = this._gcj02ToBd09(lng, lat);
    const point = new BMap.Point(blng, blat);
    const marker = new BMap.Marker(point);
    this.map.addOverlay(marker);

    const html = `<div class="wego-checkin-marker"><div class="wego-checkin-medal">✓</div>${
      opts.label ? `<div class="wego-checkin-label">${opts.label}</div>` : ''
    }</div>`;
    const label = new BMap.Label(html, { offset: new BMap.Size(-30, -52) });
    label.setStyle({ border: 'none', background: 'transparent' });
    marker.setLabel(label);

    if (opts.onClick) marker.addEventListener('click', opts.onClick);

    this.checkinOverlays.push(marker);
    return marker;
  }

  async drawRoute(coords, style = {}) {
    if (!this.map || !coords || coords.length < 2) return;

    const bPoints = coords.map(c => {
      const [blng, blat] = this._gcj02ToBd09(c.lng, c.lat);
      return new BMap.Point(blng, blat);
    });

    const polyline = new BMap.Polyline(bPoints, {
      strokeColor: style.color || "#6C5CE7",
      strokeWeight: style.weight || 5,
      strokeOpacity: 0.8
    });
    
    this.map.addOverlay(polyline);
  }

  addGeofence(lng, lat, radius, onEnter) {
    // 百度坐标转换不影响地理围栏逻辑（逻辑使用的是经纬度距离计算，底层 watchPosition 给的是 GCJ-02 或 WGS-84）
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
    }, null, { enableHighAccuracy: true });
  }

  destroy() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.checkinOverlays = [];
    if (this.map) this.map.clearOverlays();
    this.map = null;
    this.markers = [];
  }
}
