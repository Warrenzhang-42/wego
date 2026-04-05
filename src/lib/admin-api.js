/**
 * WeGO Admin API Client — admin-api.js
 *
 * 管理后台专用 SDK：前端直连 Supabase，使用 service_role key 绕过 RLS。
 *
 * 约束：
 *   - heat_level / heat_count 仅支持读取，写入会静默忽略
 *   - published_version / last_published_at 仅能通过 publishRoute 更新
 *   - 坐标入库为 WGS-84（录入转换在 UI 层完成）
 */

'use strict';

import { computeRouteMetrics, spotsForPathAndMetrics } from './route-metrics.js';
import { buildRouteShapeThumbnailDataUrl } from './route-shape-thumbnail.js';

const _cfg = window.__WEGO_API_CONFIG__ || {};
const _serviceKey = _cfg.supabaseServiceKey;
const _url = _cfg.supabaseUrl;

if (!_serviceKey || !_url) {
  console.error('[admin-api] 缺少配置：需要 supabaseUrl 和 supabaseServiceKey');
}

let _client = null;

async function _getClient() {
  if (_client) return _client;
  if (!window.supabase) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Supabase SDK 加载失败'));
      document.head.appendChild(s);
    });
  }
  _client = window.supabase.createClient(_url, _serviceKey);
  return _client;
}

function _stripHeatFields(patch) {
  const { heat_level, heat_count, ...safe } = patch;
  return safe;
}

function _stripPublishGuard(patch) {
  const { published_version, last_published_at, ...rest } = patch;
  return rest;
}

function _buildContractSnapshot(route, spots) {
  const spotRows = (spots || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  return {
    id: route.id,
    title: route.title,
    description: route.description ?? '',
    duration_minutes: route.duration_minutes ?? null,
    tags: route.tags || [],
    category: route.category ?? '',
    city_adcode: route.city_adcode ?? '',
    cover_image: route.cover_image ?? '',
    thumbnail_image: route.thumbnail_image ?? '',
    is_visible: route.is_visible !== false,
    published_version: route.published_version ?? 0,
    last_published_at: route.last_published_at ?? null,
    total_distance_km: route.total_distance_km != null ? Number(route.total_distance_km) : null,
    spots: spotRows.map((s) => ({
      id: s.id,
      name: s.name,
      subtitle: s.subtitle ?? '',
      short_desc: s.short_desc ?? '',
      detail: s.detail ?? '',
      rich_content: (s.rich_content ?? s.detail ?? '') || '',
      tags: s.tags || [],
      thumb: s.thumb ?? '',
      photos: s.photos || [],
      lat: Number(s.lat),
      lng: Number(s.lng),
      geofence_radius_m: s.geofence_radius_m ?? 30,
      estimated_stay_min: s.estimated_stay_min ?? null,
      sort_order: s.sort_order,
      is_visible: s.is_visible !== false,
      is_easter_egg: !!s.is_easter_egg,
      spot_type: s.spot_type || 'attraction',
    })),
  };
}

/**
 * @param {Object} opts
 * @param {string} [opts.search]
 * @param {string} [opts.city_adcode]
 * @param {boolean} [opts.is_visible]
 * @param {number} [opts.page]
 * @param {number} [opts.pageSize]
 */
async function getRoutesAdmin({ search, city_adcode, is_visible, page = 1, pageSize = 20 } = {}) {
  const sb = await _getClient();
  let query = sb.from('routes').select('*', { count: 'exact' });

  if (search) query = query.ilike('title', `%${search}%`);
  if (city_adcode) query = query.eq('city_adcode', city_adcode);
  if (typeof is_visible === 'boolean') query = query.eq('is_visible', is_visible);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) throw new Error(`[admin-api] getRoutesAdmin 失败: ${error.message}`);
  return { data: data || [], total: count || 0, page, pageSize };
}

async function getRouteAdmin(id) {
  const sb = await _getClient();
  const [route, spots] = await Promise.all([
    sb.from('routes').select('*').eq('id', id).single(),
    sb.from('spots').select('*').eq('route_id', id).order('sort_order', { ascending: true }),
  ]);
  if (route.error) throw new Error(`[admin-api] getRouteAdmin 失败: ${route.error.message}`);
  return { ...route.data, spots: spots.data || [] };
}

async function insertRoute(payload = {}) {
  const sb = await _getClient();
  const row = {
    title: payload.title || '未命名路线',
    description: payload.description ?? null,
    tags: payload.tags || [],
    city_adcode: payload.city_adcode ?? null,
    cover_image: payload.cover_image ?? null,
    is_visible: payload.is_visible !== false,
  };
  const { data, error } = await sb.from('routes').insert(row).select().single();
  if (error) throw new Error(`[admin-api] insertRoute 失败: ${error.message}`);
  return data;
}

/**
 * @param {string} id
 * @param {Object} patch
 */
async function updateRoute(id, patch) {
  const sb = await _getClient();
  const safe = _stripPublishGuard(_stripHeatFields(patch));
  const { data, error } = await sb
    .from('routes')
    .update({
      ...safe,
      draft_saved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`[admin-api] updateRoute 失败: ${error.message}`);
  return data;
}

async function deleteRoute(id) {
  const sb = await _getClient();
  const { error } = await sb.from('routes').delete().eq('id', id);
  if (error) throw new Error(`[admin-api] deleteRoute 失败: ${error.message}`);
  return { id };
}

/**
 * 根据当前 spots 重算距离/时长并可选生成缩略图，写回路线。
 */
async function recomputeRouteDerived(id) {
  const full = await getRouteAdmin(id);
  const metrics = computeRouteMetrics(full.spots || []);
  const pathPts = spotsForPathAndMetrics(full.spots || []).map((s) => ({
    lat: Number(s.lat),
    lng: Number(s.lng),
  }));
  const thumb = buildRouteShapeThumbnailDataUrl(pathPts);
  const thumbnail_image =
    thumb || (full.cover_image && String(full.cover_image)) || full.thumbnail_image || null;

  return updateRoute(id, {
    duration_minutes: metrics.duration_minutes,
    total_distance_km: metrics.total_distance_km,
    thumbnail_image,
  });
}

/**
 * 发布：快照入 route_versions，递增 published_version，更新 last_published_at；先重算衍生字段。
 */
async function publishRoute(id) {
  const sb = await _getClient();
  await recomputeRouteDerived(id);
  const full = await getRouteAdmin(id);
  const nextVersion = (full.published_version || 0) + 1;
  const snapshot = _buildContractSnapshot(full, full.spots);

  const { error: verErr } = await sb.from('route_versions').insert({
    route_id: id,
    version_number: nextVersion,
    snapshot,
  });
  if (verErr) throw new Error(`[admin-api] publishRoute 写入版本失败: ${verErr.message}`);

  const { data, error } = await sb
    .from('routes')
    .update({
      published_version: nextVersion,
      last_published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`[admin-api] publishRoute 更新路线失败: ${error.message}`);
  return { route: data, version: nextVersion, snapshot };
}

async function getRouteVersions(routeId) {
  const sb = await _getClient();
  const { data, error } = await sb
    .from('route_versions')
    .select('id, version_number, published_at')
    .eq('route_id', routeId)
    .order('version_number', { ascending: false });
  if (error) throw new Error(`[admin-api] getRouteVersions 失败: ${error.message}`);
  return data || [];
}

async function getSpotsAdmin(routeId) {
  const sb = await _getClient();
  const { data, error } = await sb
    .from('spots')
    .select('*')
    .eq('route_id', routeId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`[admin-api] getSpotsAdmin 失败: ${error.message}`);
  return data || [];
}

async function updateSpot(id, patch) {
  const sb = await _getClient();
  const { data, error } = await sb
    .from('spots')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`[admin-api] updateSpot 失败: ${error.message}`);
  return data;
}

async function insertSpot(payload) {
  const sb = await _getClient();
  const { data, error } = await sb.from('spots').insert(payload).select().single();
  if (error) throw new Error(`[admin-api] insertSpot 失败: ${error.message}`);
  return data;
}

async function deleteSpot(id) {
  const sb = await _getClient();
  const { error } = await sb.from('spots').delete().eq('id', id);
  if (error) throw new Error(`[admin-api] deleteSpot 失败: ${error.message}`);
  return { id };
}

/**
 * 上传封面图到 Supabase Storage，返回公开 URL。
 * @param {File} file - 图片文件
 * @param {string} [routeId] - 关联路线 ID（用于组织存储路径）
 * @returns {Promise<string>} 公开访问 URL
 */
async function uploadCoverImage(file, routeId) {
  const sb = await _getClient();
  const ext = file.name.split('.').pop() || 'jpg';
  const path = routeId
    ? `route-covers/${routeId}/${Date.now()}.${ext}`
    : `temp/cover-${Date.now()}.${ext}`;

  const { data, error: uploadError } = await sb.storage
    .from('images')
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (uploadError) throw new Error(`[admin-api] uploadCoverImage 上传失败: ${uploadError.message}`);

  const { data: urlData } = sb.storage.from('images').getPublicUrl(data.path);
  return urlData.publicUrl;
}

/**
 * 轮播配置：config_key 为 general 或 city:六位 adcode
 */
async function getCarouselConfig(configKey) {
  const sb = await _getClient();
  const { data, error } = await sb
    .from('home_carousel_configs')
    .select('*')
    .eq('config_key', configKey)
    .maybeSingle();
  if (error) throw new Error(`[admin-api] getCarouselConfig 失败: ${error.message}`);
  return data || null;
}

/**
 * @returns {Promise<{ config_key: string, items: unknown[], updated_at?: string }[]>}
 */
async function listCarouselConfigs() {
  const sb = await _getClient();
  const { data, error } = await sb
    .from('home_carousel_configs')
    .select('config_key, items, updated_at')
    .order('config_key', { ascending: true });
  if (error) throw new Error(`[admin-api] listCarouselConfigs 失败: ${error.message}`);
  return data || [];
}

async function upsertCarouselConfig(configKey, items) {
  const sb = await _getClient();
  const { data, error } = await sb
    .from('home_carousel_configs')
    .upsert(
      { config_key: configKey, items },
      { onConflict: 'config_key' }
    )
    .select()
    .single();
  if (error) throw new Error(`[admin-api] upsertCarouselConfig 失败: ${error.message}`);
  return data;
}

async function deleteCarouselConfig(configKey) {
  const sb = await _getClient();
  const { error } = await sb.from('home_carousel_configs').delete().eq('config_key', configKey);
  if (error) throw new Error(`[admin-api] deleteCarouselConfig 失败: ${error.message}`);
  return { config_key: configKey };
}

/**
 * 删除「有 city: 行但未加入任何地区组合」的孤儿配置，与从地区移除城市行为一致（首页回退通用轮播）。
 */
async function reconcileOrphanCityCarouselConfigs() {
  const rows = await listCarouselConfigs();
  const groups = await listCarouselCityGroups();
  const used = new Set();
  for (const g of groups) {
    for (const ad of g.city_adcodes || []) used.add(ad);
  }
  for (const r of rows) {
    const key = r.config_key;
    if (!key || !key.startsWith('city:')) continue;
    const ad = key.replace(/^city:/, '');
    if (!used.has(ad)) await deleteCarouselConfig(key);
  }
}

/**
 * @returns {Promise<{ id: string, name: string, created_at?: string, city_adcodes: string[] }[]>}
 */
async function listCarouselCityGroups() {
  const sb = await _getClient();
  const { data: groups, error: e1 } = await sb
    .from('home_carousel_city_groups')
    .select('id, name, created_at')
    .order('created_at', { ascending: true });
  if (e1) throw new Error(`[admin-api] listCarouselCityGroups 失败: ${e1.message}`);
  const { data: members, error: e2 } = await sb
    .from('home_carousel_city_group_members')
    .select('group_id, city_adcode');
  if (e2) throw new Error(`[admin-api] listCarouselCityGroups 失败: ${e2.message}`);
  const map = new Map();
  for (const g of groups || []) {
    map.set(g.id, { id: g.id, name: g.name || '', created_at: g.created_at, city_adcodes: [] });
  }
  for (const m of members || []) {
    const row = map.get(m.group_id);
    if (row) row.city_adcodes.push(m.city_adcode);
  }
  for (const g of map.values()) {
    g.city_adcodes.sort();
  }
  return [...map.values()];
}

/**
 * 新建组合：若某城已有 city: 行，取首个非空 items 作为整组初始内容并同步到所有成员。
 * @param {string} name
 * @param {string[]} cityAdcodes
 */
async function createCarouselCityGroup(name, cityAdcodes) {
  const uniq = [...new Set((cityAdcodes || []).filter(Boolean))];
  if (!uniq.length) throw new Error('[admin-api] 创建组合至少需要选择一个城市');
  const sb = await _getClient();
  const { data: taken, error: e0 } = await sb
    .from('home_carousel_city_group_members')
    .select('city_adcode')
    .in('city_adcode', uniq);
  if (e0) throw new Error(`[admin-api] createCarouselCityGroup 失败: ${e0.message}`);
  if (taken && taken.length) {
    const list = taken.map((r) => r.city_adcode).join(', ');
    throw new Error(`[admin-api] 以下城市已在其他组合中：${list}`);
  }
  let items = [];
  for (const ad of uniq) {
    const row = await getCarouselConfig(`city:${ad}`);
    if (row && Array.isArray(row.items) && row.items.length) {
      items = JSON.parse(JSON.stringify(row.items));
      break;
    }
  }
  const { data: grp, error: eg } = await sb
    .from('home_carousel_city_groups')
    .insert({ name: name != null ? String(name) : '' })
    .select()
    .single();
  if (eg) throw new Error(`[admin-api] createCarouselCityGroup 失败: ${eg.message}`);
  const memRows = uniq.map((city_adcode) => ({ group_id: grp.id, city_adcode }));
  const { error: em } = await sb.from('home_carousel_city_group_members').insert(memRows);
  if (em) {
    await sb.from('home_carousel_city_groups').delete().eq('id', grp.id);
    throw new Error(`[admin-api] createCarouselCityGroup 失败: ${em.message}`);
  }
  for (const ad of uniq) {
    await upsertCarouselConfig(`city:${ad}`, items);
  }
  return grp;
}

async function updateCarouselCityGroupName(groupId, name) {
  const sb = await _getClient();
  const { error } = await sb
    .from('home_carousel_city_groups')
    .update({ name: name != null ? String(name) : '' })
    .eq('id', groupId);
  if (error) throw new Error(`[admin-api] updateCarouselCityGroupName 失败: ${error.message}`);
}

/**
 * 将同一套 items 写入组合内全部城市的 config 行。
 * @param {string} groupId
 * @param {unknown[]} items
 */
async function saveCarouselCityGroupItems(groupId, items) {
  const sb = await _getClient();
  const { data: mems, error } = await sb
    .from('home_carousel_city_group_members')
    .select('city_adcode')
    .eq('group_id', groupId);
  if (error) throw new Error(`[admin-api] saveCarouselCityGroupItems 失败: ${error.message}`);
  if (!mems || !mems.length) throw new Error('[admin-api] 该组合内没有城市，无法保存');
  const payload = JSON.parse(JSON.stringify(items || []));
  for (const m of mems) {
    await upsertCarouselConfig(`city:${m.city_adcode}`, payload);
  }
}

/**
 * 向组合追加城市：轮播内容与现有成员保持一致（取任一成员当前 items）。
 */
async function addCityToCarouselGroup(groupId, cityAdcode) {
  if (!cityAdcode) throw new Error('[admin-api] 未选择城市');
  const sb = await _getClient();
  const { data: clash } = await sb
    .from('home_carousel_city_group_members')
    .select('group_id')
    .eq('city_adcode', cityAdcode)
    .maybeSingle();
  if (clash && clash.group_id === groupId) return;
  if (clash && clash.group_id && clash.group_id !== groupId) {
    throw new Error(`[admin-api] 城市 ${cityAdcode} 已属于其他组合`);
  }
  const { data: mems } = await sb
    .from('home_carousel_city_group_members')
    .select('city_adcode')
    .eq('group_id', groupId);
  let items = [];
  if (mems && mems.length) {
    const first = mems[0].city_adcode;
    const row = await getCarouselConfig(`city:${first}`);
    items = row && Array.isArray(row.items) ? JSON.parse(JSON.stringify(row.items)) : [];
  }
  const { error } = await sb
    .from('home_carousel_city_group_members')
    .insert({ group_id: groupId, city_adcode: cityAdcode });
  if (error) throw new Error(`[admin-api] addCityToCarouselGroup 失败: ${error.message}`);
  await upsertCarouselConfig(`city:${cityAdcode}`, items);
}

/**
 * 从组合移除城市并删除该城的地区轮播覆盖（首页回退通用轮播）。
 */
async function removeCityFromCarouselGroup(groupId, cityAdcode) {
  const sb = await _getClient();
  const { error } = await sb
    .from('home_carousel_city_group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('city_adcode', cityAdcode);
  if (error) throw new Error(`[admin-api] removeCityFromCarouselGroup 失败: ${error.message}`);
  await deleteCarouselConfig(`city:${cityAdcode}`);
  const { data: left } = await sb
    .from('home_carousel_city_group_members')
    .select('city_adcode')
    .eq('group_id', groupId);
  if (!left || !left.length) {
    await sb.from('home_carousel_city_groups').delete().eq('id', groupId);
  }
}

/**
 * 删除整个组合并移除各成员城市的地区轮播覆盖。
 */
async function deleteCarouselCityGroup(groupId) {
  const sb = await _getClient();
  const { data: mems } = await sb
    .from('home_carousel_city_group_members')
    .select('city_adcode')
    .eq('group_id', groupId);
  const { error } = await sb.from('home_carousel_city_groups').delete().eq('id', groupId);
  if (error) throw new Error(`[admin-api] deleteCarouselCityGroup 失败: ${error.message}`);
  for (const m of mems || []) {
    await deleteCarouselConfig(`city:${m.city_adcode}`);
  }
}

/**
 * 轮播图上传至 Storage，路径独立于路线封面。
 */
async function uploadCarouselImage(file) {
  const sb = await _getClient();
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `carousel/banners/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { data, error: uploadError } = await sb.storage
    .from('images')
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (uploadError) throw new Error(`[admin-api] uploadCarouselImage 上传失败: ${uploadError.message}`);

  const { data: urlData } = sb.storage.from('images').getPublicUrl(data.path);
  return urlData.publicUrl;
}

/**
 * 上传景点配图到 Supabase Storage（缩略图或图集），返回公开 URL。
 */
async function uploadSpotImage(file, routeId, spotId, kind) {
  const sb = await _getClient();
  const ext = file.name.split('.').pop() || 'jpg';
  const prefix = kind === 'thumb' ? 'thumb' : 'photo';
  const path =
    routeId && spotId
      ? `spot-assets/${routeId}/${spotId}/${prefix}-${Date.now()}.${ext}`
      : `temp/spot-${prefix}-${Date.now()}.${ext}`;

  const { data, error: uploadError } = await sb.storage
    .from('images')
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (uploadError) throw new Error(`[admin-api] uploadSpotImage 上传失败: ${uploadError.message}`);

  const { data: urlData } = sb.storage.from('images').getPublicUrl(data.path);
  return urlData.publicUrl;
}

export const adminApi = {
  getRoutesAdmin,
  getRouteAdmin,
  insertRoute,
  updateRoute,
  deleteRoute,
  recomputeRouteDerived,
  publishRoute,
  getRouteVersions,
  getSpotsAdmin,
  updateSpot,
  insertSpot,
  deleteSpot,
  uploadCoverImage,
  uploadSpotImage,
  getCarouselConfig,
  listCarouselConfigs,
  upsertCarouselConfig,
  deleteCarouselConfig,
  listCarouselCityGroups,
  createCarouselCityGroup,
  updateCarouselCityGroupName,
  saveCarouselCityGroupItems,
  addCityToCarouselGroup,
  removeCityFromCarouselGroup,
  deleteCarouselCityGroup,
  reconcileOrphanCityCarouselConfigs,
  uploadCarouselImage,
};
