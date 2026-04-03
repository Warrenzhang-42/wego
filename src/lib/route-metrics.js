/**
 * 路线距离/时长：仅统计 is_visible 且非彩蛋的点，按 sort_order。
 */

'use strict';

const EARTH_R_KM = 6371;

function haversineKm(lat1, lng1, lat2, lng2) {
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_R_KM * c;
}

/** @param {Array<object>} spots */
export function spotsForPathAndMetrics(spots) {
  if (!spots || !spots.length) return [];
  return spots
    .filter((s) => s.is_visible !== false && !s.is_easter_egg)
    .slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

/**
 * @param {Array<object>} spots
 * @param {{ minutesPerKm?: number }} [opts]
 */
export function computeRouteMetrics(spots, opts = {}) {
  const minutesPerKm = opts.minutesPerKm ?? 5;
  const path = spotsForPathAndMetrics(spots);
  let totalDistanceKm = 0;
  for (let i = 1; i < path.length; i++) {
    totalDistanceKm += haversineKm(
      Number(path[i - 1].lat),
      Number(path[i - 1].lng),
      Number(path[i].lat),
      Number(path[i].lng)
    );
  }
  let stay = 0;
  for (const s of path) {
    const m = s.estimated_stay_min;
    if (m != null && Number.isFinite(Number(m))) stay += Number(m);
  }
  const travelMin = Math.round(totalDistanceKm * minutesPerKm);
  const durationMinutes = stay + travelMin;
  return {
    total_distance_km: Math.round(totalDistanceKm * 1000) / 1000,
    duration_minutes: Math.max(0, durationMinutes),
    pathPointCount: path.length,
  };
}
