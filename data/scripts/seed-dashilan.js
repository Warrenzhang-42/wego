#!/usr/bin/env node
/**
 * seed-dashilan.js
 * WeGO · Sprint 2.6
 *
 * 将 data/routes/dashilan.json 导入 Supabase routes + spots 表。
 * 支持双模式运行：
 *   - DRY_RUN=true node seed-dashilan.js   → 仅打印，不写库
 *   - node seed-dashilan.js                → 真实写入（需配置 .env）
 *
 * 依赖（在 WeGO 根目录下安装）：
 *   npm install @supabase/supabase-js dotenv
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ------ 读取环境变量 ------
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const SUPABASE_URL      = process.env.SUPABASE_URL      || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const DRY_RUN           = process.env.DRY_RUN === 'true';

// ------ 加载路线数据 ------
const routeDataPath = path.resolve(__dirname, '../routes/dashilan.json');
const routeData     = JSON.parse(fs.readFileSync(routeDataPath, 'utf-8'));

// ------ 准备插入数据 ------
const routeRow = {
  id:                routeData.id,
  title:             routeData.title,
  description:       routeData.description       || null,
  duration_minutes:  routeData.duration_minutes  || null,
  difficulty:        routeData.difficulty        || 'easy',
  tags:              routeData.tags              || [],
  cover_image:       routeData.cover_image       || null,
  total_distance_km: routeData.total_distance_km || null,
};

const spotRows = (routeData.spots || []).map(spot => ({
  id:                 spot.id,
  route_id:           routeData.id,
  name:               spot.name,
  subtitle:           spot.subtitle           || null,
  short_desc:         spot.short_desc         || null,
  detail:             spot.detail             || null,
  tags:               spot.tags               || [],
  thumb:              spot.thumb              || null,
  photos:             spot.photos             || [],
  lat:                spot.lat,
  lng:                spot.lng,
  geofence_radius_m:  spot.geofence_radius_m  ?? 30,
  estimated_stay_min: spot.estimated_stay_min ?? null,
  sort_order:         spot.sort_order,
}));

// ------ DRY RUN ------
if (DRY_RUN) {
  console.log('=== DRY RUN MODE ===');
  console.log('\n[route row]');
  console.log(JSON.stringify(routeRow, null, 2));
  console.log(`\n[spot rows] (${spotRows.length} spots)`);
  spotRows.forEach((s, i) => console.log(`  ${i + 1}. ${s.name} (${s.lat}, ${s.lng})`));
  console.log('\nDRY RUN complete. No data written.');
  process.exit(0);
}

// ------ 真实写入 ------
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    'Error: SUPABASE_URL 和 SUPABASE_ANON_KEY 环境变量未配置。\n' +
    '请在 .env 文件中填入，或使用 DRY_RUN=true 模式预览数据。'
  );
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function seed() {
  console.log(`Seeding route: "${routeRow.title}" ...`);

  // 1. Upsert route
  const { error: routeErr } = await supabase
    .from('routes')
    .upsert(routeRow, { onConflict: 'id' });

  if (routeErr) {
    console.error('routes upsert 失败:', routeErr.message);
    process.exit(1);
  }
  console.log(`✅ Route upserted: ${routeRow.id}`);

  // 2. Upsert spots
  const { error: spotsErr } = await supabase
    .from('spots')
    .upsert(spotRows, { onConflict: 'id' });

  if (spotsErr) {
    console.error('spots upsert 失败:', spotsErr.message);
    process.exit(1);
  }
  console.log(`✅ ${spotRows.length} spots upserted.`);

  // 3. 验证
  const { data: count, error: countErr } = await supabase
    .from('spots')
    .select('id', { count: 'exact', head: true })
    .eq('route_id', routeRow.id);

  if (!countErr) {
    console.log(`\n验证通过：routes 表中路线 "${routeRow.title}" 下共 ${count} 个景点。`);
  }

  console.log('\nSeed complete!');
}

seed().catch(err => {
  console.error('Seed 异常:', err);
  process.exit(1);
});
