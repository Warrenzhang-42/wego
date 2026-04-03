/**
 * Sprint 11 契约烟测：
 * - route-upload.schema.json 必填字段与 file_type 枚举
 * - route-ingestion.schema.json gap_items 扩展字段存在
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

test('route-upload 契约：必填字段与文件类型枚举正确', () => {
  const schema = readJson('contracts/route-upload.schema.json');
  assert.deepEqual(schema.required, ['session_id', 'file_content', 'file_type']);
  assert.deepEqual(schema.properties.file_type.enum, ['json', 'markdown', 'txt', 'url']);
});

test('route-ingestion 契约：gap_items 扩展字段存在', () => {
  const schema = readJson('contracts/route-ingestion.schema.json');
  assert.equal(schema.properties.gap_items.type, 'array');

  const gap = schema.$defs.gap_item;
  assert.ok(gap, '缺少 $defs.gap_item');
  assert.ok(gap.required.includes('field'));
  assert.ok(gap.required.includes('message'));
  assert.ok(gap.required.includes('gap_type'));
  assert.deepEqual(gap.properties.gap_type.enum, ['objective', 'subjective']);
  assert.equal(gap.properties.auto_queried.type, 'boolean');
  assert.ok('suggested_value' in gap.properties);
});
