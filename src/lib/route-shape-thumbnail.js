/**
 * 根据参与路径的经纬度序列生成路线形状 PNG data URL（圆角卡片风格，贴近 WeGO 主色）。
 * 仅在浏览器环境使用（Canvas）。
 */

'use strict';

const W = 480;
const H = 280;
const PAD = 36;
const RADIUS = 16;

/** @param {{ lat: number, lng: number }[]} points WGS-84 */
export function buildRouteShapeThumbnailDataUrl(points) {
  if (typeof document === 'undefined') return null;
  if (!points || points.length < 2) return null;

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const midLat = (minLat + maxLat) / 2;
  const cos = Math.cos((midLat * Math.PI) / 180);
  const spanLat = Math.max(maxLat - minLat, 0.0002);
  const spanLng = Math.max(maxLng - minLng, 0.0002);
  const padLat = spanLat * 0.15;
  const padLng = spanLng * 0.15;
  const lat0 = minLat - padLat;
  const lat1 = maxLat + padLat;
  const lng0 = minLng - padLng;
  const lng1 = maxLng + padLng;
  const effLat = lat1 - lat0;
  const effLng = (lng1 - lng0) * Math.max(cos, 0.2);

  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  function project(lat, lng) {
    const xNorm = ((lng - lng0) * Math.max(cos, 0.2)) / effLng;
    const yNorm = (lat - lat0) / effLat;
    const x = PAD + xNorm * innerW;
    const y = PAD + (1 - yNorm) * innerH;
    return { x, y };
  }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#f6f1e8';
  ctx.beginPath();
  ctx.moveTo(RADIUS, 0);
  ctx.lineTo(W - RADIUS, 0);
  ctx.quadraticCurveTo(W, 0, W, RADIUS);
  ctx.lineTo(W, H - RADIUS);
  ctx.quadraticCurveTo(W, H, W - RADIUS, H);
  ctx.lineTo(RADIUS, H);
  ctx.quadraticCurveTo(0, H, 0, H - RADIUS);
  ctx.lineTo(0, RADIUS);
  ctx.quadraticCurveTo(0, 0, RADIUS, 0);
  ctx.closePath();
  ctx.fill();

  const proj = points.map((p) => project(p.lat, p.lng));

  ctx.strokeStyle = 'rgba(196, 165, 116, 0.35)';
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(proj[0].x, proj[0].y);
  for (let i = 1; i < proj.length; i++) ctx.lineTo(proj[i].x, proj[i].y);
  ctx.stroke();

  ctx.strokeStyle = '#b8925a';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(proj[0].x, proj[0].y);
  for (let i = 1; i < proj.length; i++) ctx.lineTo(proj[i].x, proj[i].y);
  ctx.stroke();

  for (let i = 0; i < proj.length; i++) {
    ctx.fillStyle = i === 0 || i === proj.length - 1 ? '#2c2416' : '#5c4d3a';
    ctx.beginPath();
    ctx.arc(proj[i].x, proj[i].y, i === 0 || i === proj.length - 1 ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
