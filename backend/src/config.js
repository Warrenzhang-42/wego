const path = require('path');

function toInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

const config = {
  port: toInt(process.env.BACKEND_PORT, 8787),
  /** 默认 0.0.0.0 便于同 WiFi 设备访问；仅本机可设 BACKEND_HOST=127.0.0.1 */
  listenHost: process.env.BACKEND_HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  databaseUrl: process.env.DATABASE_URL || '',
  uploadRoot: process.env.UPLOAD_ROOT || path.resolve(process.cwd(), 'storage', 'images'),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
};

module.exports = { config };
