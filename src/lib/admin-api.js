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
 * 上传景点配图到 Supabase Storage（缩略图或图集），返回公开 URL。
 * @param {File} file
 * @param {string} [routeId]
 * @param {string} [spotId]
 * @param {'thumb'|'gallery'} kind
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
};
