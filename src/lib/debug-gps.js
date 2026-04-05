/**
 * WeGO Debug GPS Tool
 * Floating window to fake location for testing geofences.
 */
import { eventBus } from './event-bus.js';
import { geofenceManager } from './geofence-manager.js';

const SIMULATE_SPOT_TIMEOUT_MS = 120000;
const SIMULATE_GAP_MS = 600;

/**
 * 按 sort_order 依次将坐标设到每个景点中心，触发 geofence:enter → AI 讲解；
 * 需已打开 ai-chat 且本地 Agent (8000) 可用。
 * @returns {Promise<void>}
 */
export async function simulateAllGeofencesSequential() {
  let spots = geofenceManager.spots || [];
  if (spots.length === 0) {
    await new Promise((r) => setTimeout(r, 800));
    spots = geofenceManager.spots || [];
  }
  if (spots.length === 0) {
    console.warn('[debug-gps] simulateAll: 景点列表为空，请等 initWithRoute 完成后再试');
    return;
  }

  geofenceManager.resetForSimulation();
  console.log(`[debug-gps] 开始串行模拟 ${spots.length} 个景点…`);

  for (let i = 0; i < spots.length; i++) {
    const spot = spots[i];
    console.log(`[debug-gps] (${i + 1}/${spots.length}) 定位到: ${spot.name}`);
    geofenceManager.forceUpdate(spot.lat, spot.lng);

    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        eventBus.off('geofence:narration:done', onDone);
        console.warn(`[debug-gps] 「${spot.name}」讲解等待超时 (${SIMULATE_SPOT_TIMEOUT_MS}ms)，继续下一景点`);
        resolve();
      }, SIMULATE_SPOT_TIMEOUT_MS);

      function onDone() {
        clearTimeout(timer);
        eventBus.off('geofence:narration:done', onDone);
        resolve();
      }

      eventBus.once('geofence:narration:done', onDone);
    });

    if (i < spots.length - 1) {
      await new Promise((r) => setTimeout(r, SIMULATE_GAP_MS));
    }
  }

  console.log('[debug-gps] 串行模拟全部景点已完成（请对照聊天区与 geofence_narration 数据）');
}

class DebugGPSTool {
  constructor() {
    this.el = null;
    this.init();
  }

  init() {
    const html = `
      <div id="wego-debug-gps" 
           style="position: fixed; bottom: 110px; right: 10px; z-index: 10000; 
                  background: rgba(0,0,0,0.85); color: #ccc; padding: 12px; 
                  border-radius: 12px; font-size: 11px; width: 160px; 
                  font-family: 'Manrope', system-ui, sans-serif; border: 1px solid #555;
                  box-shadow: 0 4px 20px rgba(0,0,0,0.4); backdrop-filter: blur(10px);">
        <div style="margin-bottom: 8px; font-weight: 700; font-size: 12px; color: #fff; display: flex; align-items: center; justify-content: space-between;">
           <span>🛰️ GPS 模拟器</span>
           <button id="debug-close" style="background:none; border:none; color:#777; cursor:pointer; font-size:14px;">×</button>
        </div>
        <div id="debug-current-pos" style="margin-bottom: 10px; color: #69f; font-family: monospace; background: #111; padding: 4px; border-radius: 4px;">
           Pos: 等待定位...
        </div>
        
        <div style="margin-bottom: 4px; color: #999;">纬度 (Lat):</div>
        <input id="debug-lat" type="number" step="0.0001" value="39.8965" 
               style="width: 100%; margin-bottom: 8px; background: #222; color: #fff; border: 1px solid #444; padding: 4px; border-radius: 4px; outline:none;"/>
        
        <div style="margin-bottom: 4px; color: #999;">经度 (Lng):</div>
        <input id="debug-lng" type="number" step="0.0001" value="116.3958" 
               style="width: 100%; margin-bottom: 12px; background: #222; color: #fff; border: 1px solid #444; padding: 4px; border-radius: 4px; outline:none;"/>
        
        <button id="debug-set-pos" 
                style="width: 100%; background: #b22314; border: none; color: white; 
                       padding: 8px; border-radius: 6px; cursor: pointer; font-weight: 600;
                       transition: opacity 0.2s;">
          模拟定位到此
        </button>
        <button id="debug-simulate-all" type="button"
                style="width: 100%; margin-top: 8px; background: #2d6a4f; border: none; color: white;
                       padding: 8px; border-radius: 6px; cursor: pointer; font-weight: 600;
                       font-size: 11px;">
          串行模拟全部景点
        </button>
        <div style="margin-top: 8px; font-size: 9px; color: #666; text-align: center;">杨梅竹斜街: 39.8961, 116.3925</div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    this.el = document.getElementById('wego-debug-gps');
    
    document.getElementById('debug-set-pos').onclick = () => {
      const lat = parseFloat(document.getElementById('debug-lat').value);
      const lng = parseFloat(document.getElementById('debug-lng').value);
      if (!isNaN(lat) && !isNaN(lng)) {
        geofenceManager.forceUpdate(lat, lng);
      }
    };

    const simBtn = document.getElementById('debug-simulate-all');
    if (simBtn) {
      simBtn.onclick = async () => {
        simBtn.disabled = true;
        simBtn.textContent = '模拟运行中…';
        try {
          await simulateAllGeofencesSequential();
        } finally {
          simBtn.disabled = false;
          simBtn.textContent = '串行模拟全部景点';
        }
      };
    }

    document.getElementById('debug-close').onclick = () => {
      this.el.style.display = 'none';
      console.log('[debug-gps] 模拟器已隐藏。');
    };

    eventBus.on('gps:update', (pos) => {
      const posEl = document.getElementById('debug-current-pos');
      if (posEl) {
        posEl.textContent = `Pos: ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
      }
    });
  }
}

// Auto init if it's a module but we might want to let the main app control it.
// For prototype convenience, auto-init:
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new DebugGPSTool());
} else {
  new DebugGPSTool();
}

window.__WEGO_simulateAllGeofences = simulateAllGeofencesSequential;
