/**
 * WeGO Map Adapter — map-adapter.js
 *
 * 抽象层入口：导出 WeGOMap 与 MapAdapterFactory。
 * WeGOMap 定义在 wego-map-base.js，避免与 adapters 循环依赖。
 */

'use strict';

export { WeGOMap } from './wego-map-base.js';

import { AMapAdapter }   from './adapters/amap-adapter.js';
import { MapboxAdapter } from './adapters/mapbox-adapter.js';
import { BMapAdapter }   from './adapters/bmap-adapter.js';

/* ============================================================
   MapAdapterFactory —— 工厂（Sprint 1.10 实现）
   ============================================================ */
export class MapAdapterFactory {
  /**
   * 根据 provider 名称返回对应 Adapter 实例（Sprint 1.10 补全）
   * @param {string}      provider   'amap' | 'mapbox' | 'bmap'
   * @param {HTMLElement} container
   * @param {object}      options
   * @returns {import('./wego-map-base.js').WeGOMap}
   */
  static create(provider, container, options = {}) {
    switch (provider.toLowerCase()) {
      case 'amap':
        return new AMapAdapter(container, options);
      case 'mapbox':
        return new MapboxAdapter(container, options);
      case 'bmap':
        return new BMapAdapter(container, options);
      default:
        console.warn(`Unknown map provider: ${provider}, falling back to AMap`);
        return new AMapAdapter(container, options);
    }
  }
}
