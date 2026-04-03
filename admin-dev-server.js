const { createServer } = require('http');
const { readFileSync, existsSync } = require('fs');
const { resolve } = require('path');

const APP_DIR = __dirname;
const HOST = '127.0.0.1';
const BASE_PORT = Number(process.env.ADMIN_PORT || process.env.PORT || 5174) || 5174;
const MAX_PORT_TRIES = 40;

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

function createAdminHandler() {
  return (req, res) => {
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
  };
}

function listenWithFallback(port, attempt) {
  if (attempt >= MAX_PORT_TRIES) {
    console.error(`[admin] 在 ${BASE_PORT}–${BASE_PORT + MAX_PORT_TRIES - 1} 范围内未找到可用端口。可设置 ADMIN_PORT 指定端口，或结束占用 ${BASE_PORT} 的进程。`);
    process.exit(1);
  }

  const server = createServer(createAdminHandler());

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[admin] 端口 ${port} 已被占用，尝试 ${port + 1}…`);
      listenWithFallback(port + 1, attempt + 1);
      return;
    }
    throw err;
  });

  server.listen(port, HOST, () => {
    if (port !== BASE_PORT) {
      console.warn(`[admin] 已改用端口 ${port}（默认 ${BASE_PORT} 占用中）。前台跳转请设 window.__WEGO_ADMIN_ORIGIN__ 或关闭旧后台进程。`);
    }
    console.log('WeGO Admin: http://' + HOST + ':' + port + '/admin');
    console.log('路线上传: http://' + HOST + ':' + port + '/admin#route-upload （Agent 解析 / Gap 引导）');
    console.log('前台:     http://' + HOST + ':5173/');
  });
}

listenWithFallback(BASE_PORT, 0);
