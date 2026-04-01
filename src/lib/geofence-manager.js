/**
 * WeGO Geofence Manager
 * Monitors user position and triggers geofence events for spots.
 */
import { eventBus } from './event-bus.js';
import { haversineDistance } from './geo-utils.js';
import { apiClient } from './api-client.js';

class GeofenceManager {
  constructor() {
    this.spots = [];
    this.currentPosition = null;
    this.activeFences = new Set();
    this.cooldowns = new Map(); // Cooldown to avoid duplicate triggers
    this.COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown per spot
  }

  /**
   * Initialize with current route data
   * @param {string} routeId 
   */
  async initWithRoute(routeId) {
    try {
      this.spots = await apiClient.getSpots(routeId);
      console.log(`[geofence-manager] 初始化成功，监测路线 ${routeId}，共 ${this.spots.length} 个监测点。`);
      this.startMonitoring();
    } catch (e) {
      console.error('[geofence-manager] 初始化失败:', e);
    }
  }

  startMonitoring() {
    if (!navigator.geolocation) {
      console.error('[geofence-manager] 浏览器不支持地理位置监测。');
      return;
    }

    navigator.geolocation.watchPosition(
      (pos) => this.handleUpdate(pos.coords.latitude, pos.coords.longitude),
      (err) => console.warn('[geofence-manager] 定位失败:', err.message),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  }

  /**
   * Main location logic
   */
  handleUpdate(lat, lng) {
    this.currentPosition = { lat, lng };
    // Emit globally for map or debug tool
    eventBus.emit('gps:update', this.currentPosition);

    this.spots.forEach((spot) => {
      const dist = haversineDistance(lat, lng, spot.lat, spot.lng);
      const radius = spot.geofence_radius_m || 30;

      if (dist <= radius) {
        if (!this.activeFences.has(spot.id)) {
          this.onEnter(spot);
        }
      } else {
        if (this.activeFences.has(spot.id)) {
          this.onExit(spot);
        }
      }
    });
  }

  onEnter(spot) {
    this.activeFences.add(spot.id);

    // Cooldown logic: avoid triggered twice in a short time
    const lastTrigger = this.cooldowns.get(spot.id) || 0;
    const now = Date.now();
    if (now - lastTrigger > this.COOLDOWN_MS) {
      console.log(`[geofence-manager] >> 进入围栏: ${spot.name}`);
      eventBus.emit('geofence:enter', spot);
      this.cooldowns.set(spot.id, now);
    } else {
      console.log(`[geofence-manager] >> 重新进入围栏: ${spot.name} (冷却中，静默)`);
    }
  }

  onExit(spot) {
    this.activeFences.delete(spot.id);
    console.log(`[geofence-manager] << 离开围栏: ${spot.name}`);
    eventBus.emit('geofence:exit', spot);
  }

  /**
   * Manual trigger for debug / Mock
   */
  forceUpdate(lat, lng) {
    console.log(`[geofence-manager] 手动地理位置更新: ${lat}, ${lng}`);
    this.handleUpdate(lat, lng);
  }
}

export const geofenceManager = new GeofenceManager();
window.geofenceManager = geofenceManager;
