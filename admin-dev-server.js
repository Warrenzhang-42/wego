const { createServer } = require('http');
const { readFileSync, existsSync } = require('fs');
const { resolve } = require('path');

const APP_DIR = __dirname;
const PORT = 5174;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

function mimeType(url) {
  const idx = url.lastIndexOf('.');
  const ext = idx >= 0 ? url.slice(idx) : '';
  return MIME[ext] || 'text/plain; charset=utf-8';
}

function tryRead(url) {
  const clean = url.split('?')[0];
  const path1 = resolve(APP_DIR, clean.slice(1));
  if (path1.startsWith(APP_DIR) && existsSync(path1)) return readFileSync(path1);
  const path2 = resolve(APP_DIR, 'src', clean.slice(1));
  if (path2.startsWith(APP_DIR) && existsSync(path2)) return readFileSync(path2);
  return null;
}

createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/admin') {
    const htmlPath = resolve(APP_DIR, 'src/admin-routes.html');
    try {
      const html = readFileSync(htmlPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(500);
      res.end('Error: ' + e.message);
    }
    return;
  }

  const body = tryRead(url);
  if (body !== null) {
    res.writeHead(200, { 'Content-Type': mimeType(url), 'Cache-Control': 'no-cache' });
    res.end(body);
    return;
  }
  res.writeHead(404);
  res.end('Not found: ' + url);
}).listen(PORT, '127.0.0.1', () => {
  console.log('WeGO Admin: http://127.0.0.1:' + PORT + '/admin');
  console.log('前台:     http://127.0.0.1:5173/');
});
