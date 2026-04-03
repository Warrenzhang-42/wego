#!/usr/bin/env node
/**
 * seed-beijing-catalog.js
 * 将 data/routes/beijing-catalog-seed.json 写入 Supabase（routes + spots），
 * 并对已有杨梅竹精品线补充热度/分类字段。
 *
 * 若已执行 server/migrations/005_routes_engagement.sql，会一并写入 heat_level / heat_count / category；
 * 未执行时自动降级为仅写入 001 迁移中的基础列（热度仍可由精选 JSON 合并展示）。
 *
 *   DRY_RUN=true node data/scripts/seed-beijing-catalog.js
 *   node data/scripts/seed-beijing-catalog.js
 */

'use strict';

const path = require('path');
const fs = require('fs');

const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const DRY_RUN = process.env.DRY_RUN === 'true';

const manifestPath = path.resolve(__dirname, '../routes/beijing-catalog-seed.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

function routeRowBase(routeData) {
  const { spots: _s, ...rest } = routeData;
  return {
    id: rest.id,
    title: rest.title,
    description: rest.description ?? null,
    duration_minutes: rest.duration_minutes ?? null,
    tags: rest.tags ?? [],
    cover_image: rest.cover_image ?? null,
    total_distance_km: rest.total_distance_km ?? null,
  };
}

function routeRowFull(routeData) {
  const { spots: _s, ...rest } = routeData;
  return {
    ...routeRowBase(routeData),
    heat_level: rest.heat_level ?? 3,
    heat_count: rest.heat_count ?? 0,
    category: rest.category ?? null,
  };
}

function missingEngagementColumns(msg) {
  return /heat_level|heat_count|category/i.test(String(msg || ''));
}

function spotRowsFromPayload(routeData) {
  const rid = routeData.id;
  return (routeData.spots || []).map(spot => ({
    id: spot.id,
    route_id: rid,
    name: spot.name,
    subtitle: spot.subtitle ?? null,
    short_desc: spot.short_desc ?? null,
    detail: spot.detail ?? null,
    tags: spot.tags ?? [],
    thumb: spot.thumb ?? null,
    photos: spot.photos ?? [],
    lat: spot.lat,
    lng: spot.lng,
    geofence_radius_m: spot.geofence_radius_m ?? 30,
    estimated_stay_min: spot.estimated_stay_min ?? null,
    sort_order: spot.sort_order,
  }));
}

if (DRY_RUN) {
  console.log('=== DRY RUN: beijing-catalog-seed ===\n');
  for (const r of manifest.routes || []) {
    console.log(`[route] ${r.id} — ${r.title}`);
    console.log(`  spots: ${(r.spots || []).length}`);
  }
  console.log('\n[patch]', JSON.stringify(manifest.patchRoutes || [], null, 2));
  process.exit(0);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    'Error: 请配置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY（或 ANON）于 .env\n' +
      '或运行 DRY_RUN=true 预览。'
  );
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function seed() {
  let usedBaseOnly = false;

  for (const routeData of manifest.routes || []) {
    const fullRow = routeRowFull(routeData);
    const baseRow = routeRowBase(routeData);
    const spotRows = spotRowsFromPayload(routeData);

    let routeErr;
    ({ error: routeErr } = await supabase.from('routes').upsert(fullRow, { onConflict: 'id' }));
    if (routeErr && missingEngagementColumns(routeErr.message)) {
      usedBaseOnly = true;
      ({ error: routeErr } = await supabase.from('routes').upsert(baseRow, { onConflict: 'id' }));
    }
    if (routeErr) {
      console.error(`routes upsert 失败 (${baseRow.id}):`, routeErr.message);
      process.exit(1);
    }
    console.log(`✅ route: ${baseRow.title}`);

    if (spotRows.length) {
      const { error: spotsErr } = await supabase
        .from('spots')
        .upsert(spotRows, { onConflict: 'id' });
      if (spotsErr) {
        console.error(`spots upsert 失败 (${baseRow.id}):`, spotsErr.message);
        process.exit(1);
      }
      console.log(`   → ${spotRows.length} spots`);
    }
  }

  for (const patch of manifest.patchRoutes || []) {
    const { id, ...fields } = patch;
    const { error } = await supabase.from('routes').update(fields).eq('id', id);
    if (error) {
      if (missingEngagementColumns(error.message)) {
        console.warn(
          `⚠ patch 跳过 (${id})：库表尚无热度/分类列，请在 Supabase SQL 执行 migrations/005 后重跑本脚本。`
        );
        continue;
      }
      console.error(`patch 失败 (${id}):`, error.message);
      process.exit(1);
    }
    console.log(`✅ patched route ${id}:`, fields);
  }

  console.log('\nBeijing catalog seed 完成。');
  if (usedBaseOnly) {
    console.log(
      '提示：当前为「基础列」写入。执行 server/migrations/005_routes_engagement.sql 后可再运行本脚本以补全热度字段。'
    );
  }
}

seed().catch(e => {
  console.error(e);
  process.exit(1);
});
