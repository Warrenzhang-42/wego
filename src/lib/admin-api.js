'use strict';

import { computeRouteMetrics, spotsForPathAndMetrics } from './route-metrics.js';
import { buildRouteShapeThumbnailDataUrl } from './route-shape-thumbnail.js';

const _cfg = window.__WEGO_API_CONFIG__ || {};
const _apiBase = _cfg.apiBaseUrl || '';

function _token() {
  return localStorage.getItem('wego_access_token') || '';
}

async function _request(path, opts = {}) {
  if (!_apiBase) throw new Error('[admin-api] 缺少配置：需要 apiBaseUrl');
  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  const token = _token();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${_apiBase}${path}`, { ...opts, headers });
  if (!res.ok) throw new Error(`[admin-api] ${path} 失败: ${res.status} ${await res.text()}`);
  return res.json();
}

function _stripHeatFields(patch) {
  const { heat_level, heat_count, ...safe } = patch;
  return safe;
}

function _stripPublishGuard(patch) {
  const { published_version, last_published_at, ...rest } = patch;
  return rest;
}

async function getRoutesAdmin({ search, city_adcode, is_visible, page = 1, pageSize = 20 } = {}) {
  const q = new URLSearchParams();
  if (search) q.set('search', search);
  if (city_adcode) q.set('city_adcode', city_adcode);
  if (typeof is_visible === 'boolean') q.set('is_visible', String(is_visible));
  q.set('page', String(page));
  q.set('pageSize', String(pageSize));
  return _request(`/api/admin/routes?${q.toString()}`);
}

async function getRouteAdmin(id) {
  return _request(`/api/admin/routes/${id}`);
}

async function insertRoute(payload = {}) {
  return _request('/api/admin/routes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function updateRoute(id, patch) {
  const safe = _stripPublishGuard(_stripHeatFields(patch));
  return _request(`/api/admin/routes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(safe),
  });
}

async function deleteRoute(id) {
  return _request(`/api/admin/routes/${id}`, {
    method: 'DELETE',
  });
}

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

async function publishRoute(id) {
  await recomputeRouteDerived(id);
  return _request(`/api/admin/routes/${id}/publish`, { method: 'POST' });
}

async function getRouteVersions(routeId) {
  return _request(`/api/admin/routes/${routeId}/versions`);
}

async function getSpotsAdmin(routeId) {
  return _request(`/api/admin/routes/${routeId}/spots`);
}

async function updateSpot(id, patch) {
  return _request(`/api/admin/spots/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

async function insertSpot(payload) {
  return _request('/api/admin/spots', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function deleteSpot(id) {
  return _request(`/api/admin/spots/${id}`, {
    method: 'DELETE',
  });
}

async function uploadGenericImage(file) {
  const token = _token();
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${_apiBase}/api/storage/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: fd,
  });
  if (!res.ok) throw new Error(`[admin-api] 上传失败: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.url;
}

async function uploadCoverImage(file, _routeId) {
  return uploadGenericImage(file);
}

async function uploadSpotImage(file, _routeId, _spotId, _kind) {
  return uploadGenericImage(file);
}

async function uploadCarouselImage(file) {
  return uploadGenericImage(file);
}

async function getCarouselConfig(configKey) {
  const rows = await listCarouselConfigs();
  return rows.find((r) => r.config_key === configKey) || null;
}

async function listCarouselConfigs() {
  return _request('/api/admin/carousel-configs');
}

async function upsertCarouselConfig(configKey, items) {
  return _request(`/api/admin/carousel-configs/${encodeURIComponent(configKey)}`, {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
}

async function deleteCarouselConfig(configKey) {
  return _request(`/api/admin/carousel-configs/${encodeURIComponent(configKey)}`, {
    method: 'DELETE',
  });
}

async function listCarouselCityGroups() {
  return _request('/api/admin/carousel-city-groups');
}

async function createCarouselCityGroup(name, cityAdcodes) {
  return _request('/api/admin/carousel-city-groups', {
    method: 'POST',
    body: JSON.stringify({ name, city_adcodes: cityAdcodes || [] }),
  });
}

async function updateCarouselCityGroupName(groupId, name) {
  return _request(`/api/admin/carousel-city-groups/${groupId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

async function saveCarouselCityGroupItems(groupId, items) {
  return _request(`/api/admin/carousel-city-groups/${groupId}/items`, {
    method: 'PUT',
    body: JSON.stringify({ items: items || [] }),
  });
}

async function addCityToCarouselGroup(groupId, cityAdcode) {
  return _request(`/api/admin/carousel-city-groups/${groupId}/cities`, {
    method: 'POST',
    body: JSON.stringify({ city_adcode: cityAdcode }),
  });
}

async function removeCityFromCarouselGroup(groupId, cityAdcode) {
  return _request(`/api/admin/carousel-city-groups/${groupId}/cities/${encodeURIComponent(cityAdcode)}`, {
    method: 'DELETE',
  });
}

async function deleteCarouselCityGroup(groupId) {
  return _request(`/api/admin/carousel-city-groups/${groupId}`, {
    method: 'DELETE',
  });
}

async function reconcileOrphanCityCarouselConfigs() {
  return _request('/api/admin/carousel-city-groups/reconcile', {
    method: 'POST',
  });
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
