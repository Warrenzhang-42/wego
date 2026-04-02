/**
 * WeGO Map — 抽象基类（无适配器依赖，避免与具体引擎循环引用）
 */

'use strict';

export class WeGOMap {
  /**
   * @param {HTMLElement} container  地图挂载的 DOM 容器
   * @param {object}      options    引擎专属初始化参数
   */
  constructor(container, options = {}) {
    if (new.target === WeGOMap) {
      throw new Error('WeGOMap 是抽象类，请使用具体引擎实现（如 AMapAdapter）');
    }
    this.container = container;
    this.options   = options;
  }

  /**
   * 初始化地图，加载 SDK，挂载到 container
   * @returns {Promise<void>}
   */
  init() {
    throw new Error('Not implemented: init()');
  }

  /**
   * 设置地图中心点与缩放等级
   * @param {number} lng   经度
   * @param {number} lat   纬度
   * @param {number} zoom  缩放等级（1-20）
   */
  setCenter(lng, lat, zoom) {
    throw new Error('Not implemented: setCenter()');
  }

  /**
   * 调整视野以包含指定边界
   * @param {{ sw: {lat, lng}, ne: {lat, lng} }} bounds  西南 / 东北角坐标
   */
  fitBounds(bounds) {
    throw new Error('Not implemented: fitBounds()');
  }

  /**
   * 在地图上添加标记点
   * @param {number} lng              经度
   * @param {number} lat              纬度
   * @param {{ icon?: string, label?: string, onClick?: Function }} opts  标记配置
   * @returns {*}  标记实例（各引擎原生对象）
   */
  addMarker(lng, lat, opts = {}) {
    throw new Error('Not implemented: addMarker()');
  }

  /**
   * 绘制路线（步行 polyline）
   * @param {Array<{lat: number, lng: number}>} coords  坐标序列
   * @param {{ color?: string, weight?: number }} style  线条样式
   * @returns {Promise<void>}
   */
  drawRoute(coords, style = {}) {
    throw new Error('Not implemented: drawRoute()');
  }

  /**
   * 打卡勋章标记（与高亮景点区分，发光样式由各引擎 adapter 实现）
   * @param {number} lng  经度
   * @param {number} lat  纬度
   * @param {{ label?: string, onClick?: Function }} opts
   * @returns {*}  标记实例
   */
  addCheckinMarker(lng, lat, opts = {}) {
    throw new Error('Not implemented: addCheckinMarker()');
  }

  /**
   * 添加地理围栏（圆形），结合 watchPosition 触发回调
   * @param {number}   lng       圆心经度
   * @param {number}   lat       圆心纬度
   * @param {number}   radius    围栏半径（米）
   * @param {Function} onEnter   进入围栏时的回调 (spotData) => void
   * @returns {{ stop: Function }}  返回对象含 stop() 方法以清除围栏
   */
  addGeofence(lng, lat, radius, onEnter) {
    throw new Error('Not implemented: addGeofence()');
  }

  /**
   * 销毁地图实例，释放资源
   */
  destroy() {
    throw new Error('Not implemented: destroy()');
  }
}
