const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { config } = require('./config');

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role || 'user' },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, type: 'refresh' },
    config.jwtRefreshSecret,
    { expiresIn: config.jwtRefreshExpiresIn }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwtRefreshSecret);
}

function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function extractBearer(req) {
  const raw = req.headers.authorization || '';
  if (!raw.startsWith('Bearer ')) return '';
  return raw.slice('Bearer '.length);
}

function requireAuth(req, res, next) {
  try {
    const token = extractBearer(req);
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });
    req.auth = verifyAccessToken(token);
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.auth) return res.status(401).json({ error: 'Unauthorized' });
  if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  return next();
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashPassword,
  verifyPassword,
  requireAuth,
  requireAdmin,
};
