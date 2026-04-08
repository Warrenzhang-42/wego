/**
 * 注入 window.__WEGO_API_CONFIG__.apiBaseUrl（与 infra/nginx 的 /api 反代一致）
 *
 * - 本地 Vite / 常见静态端口：API 仍走本机 8787（与 docs/local-dev-runbook 一致）
 * - 生产环境：与页面同源（https + 域名），避免 mixed content 与 8787 端口未对公网开放
 */
(function () {
  'use strict';

  function resolveApiBaseUrl() {
    var h = location.hostname;
    var p = location.port || '';
    var devPorts = { '5173': 1, '5174': 1, '3000': 1, '8080': 1, '4173': 1 };
    if (devPorts[p]) {
      return location.protocol + '//' + h + ':8787';
    }
    if (h === 'localhost' || h === '127.0.0.1') {
      if (p && p !== '8787') {
        return location.protocol + '//' + h + ':8787';
      }
    }
    return location.origin;
  }

  var cfg = window.__WEGO_API_CONFIG__ || {};
  cfg.apiBaseUrl = resolveApiBaseUrl();
  window.__WEGO_API_CONFIG__ = cfg;
})();
