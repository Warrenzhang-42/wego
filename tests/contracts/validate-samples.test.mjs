/**
 * 契约烟测：Schema 可解析 + 样例数据满足必填字段
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');

function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'));
}

test('contracts/*.schema.json 均可解析', () => {
  const names = [
    'contracts/route.schema.json',
    'contracts/spot.schema.json',
    'contracts/chat-message.schema.json',
    'contracts/checkin.schema.json',
    'contracts/geofence-trigger.schema.json',
    'contracts/knowledge-chunk.schema.json',
    'contracts/route-plan-request.schema.json',
    'contracts/route-plan-response.schema.json',
  ];
  for (const n of names) {
    const j = readJson(n);
    assert.ok(j && typeof j === 'object', n);
  }
});

test('data/routes/dashilan.json 符合 route + spot 必填字段', () => {
  const route = readJson('data/routes/dashilan.json');
  assert.ok(route.id && route.title && Array.isArray(route.spots));
  for (const s of route.spots) {
    assert.ok(s.id && s.name, 'spot.id/name');
    assert.ok(typeof s.lat === 'number' && typeof s.lng === 'number', 'lat/lng');
    assert.ok(typeof s.sort_order === 'number', 'sort_order');
  }
});

test('checkin 样例对象字段齐全', () => {
  const sample = {
    spot_id: '7f8a1b2c-3d4e-4f5a-8b9c-0d1e2f3a4b5c',
    lat: 39.896,
    lng: 116.393,
  };
  const schema = readJson('contracts/checkin.schema.json');
  assert.ok(schema.required.every((k) => k in sample));
});
