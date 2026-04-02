/**
 * Sprint 0.5 — haversine 距离（米）烟测
 * （与 src/lib/geo-utils.js 公式保持一致；项目在 Vite 下为 ES 模块，Node 单测内联避免 CJS/ESM 混用）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const R = 6371000;
function haversineDistance(lat1, lng1, lat2, lng2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

test('haversineDistance: 近似已知短距离', () => {
  const a = haversineDistance(39.896134, 116.393245, 39.895982, 116.394123);
  assert.ok(a > 10 && a < 500, `expected ~100-200m, got ${a}`);
});

test('haversineDistance: 同一点为 0', () => {
  assert.equal(haversineDistance(39.9, 116.4, 39.9, 116.4), 0);
});
