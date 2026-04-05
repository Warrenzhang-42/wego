const path = require('path');
const fs = require('fs');
const { defineConfig } = require('vite');

const repoRoot = __dirname;
const dataRoot = path.join(repoRoot, 'data');

/**
 * dev 命令使用 root = src，页面 URL 应为 /ai-chat.html，而不是 /src/ai-chat.html。
 * 仓库路径习惯带 src/，中间件把 /src/* 重写为 /*，避免误开成首页或其它回退页。
 *
 * api-client 本地模式会 fetch /data/routes/*.json（由页面相对路径 ../data 解析而来），
 * 但 Vite root 仅为 src，故需把 /data 映射到仓库根目录的 data/，否则会拿到 HTML 导致 JSON 解析失败。
 */
module.exports = defineConfig({
  root: path.resolve(__dirname, 'src'),
  /** 多 HTML 入口；避免把不存在的路径当成 SPA 回退到 index.html */
  appType: 'mpa',
  /**
   * Chrome 146+ 默认禁止文档使用 unload/beforeunload（利于 bfcache）。
   * Vite HMR 客户端会注册 beforeunload，不设此头时控制台会出现
   * Permissions policy violation: unload is not allowed。
   * 生产构建不注入 @vite/client，一般无此提示。
   */
  server: {
    headers: {
      'Permissions-Policy': 'unload=(self)',
    },
    fs: {
      allow: [path.resolve(__dirname, 'src'), dataRoot],
    },
  },
  plugins: [
    {
      name: 'wego-dev-data-static',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const raw = req.url && req.url.split('?')[0];
          if (!raw || !raw.startsWith('/data/')) return next();
          const rel = decodeURIComponent(raw.slice('/data/'.length));
          if (!rel || rel.includes('..')) return next();
          const filePath = path.join(dataRoot, rel);
          if (!filePath.startsWith(dataRoot)) return next();
          fs.stat(filePath, (err, st) => {
            if (err || !st.isFile()) return next();
            if (filePath.endsWith('.json')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
            fs.createReadStream(filePath).pipe(res);
          });
        });
      },
    },
    {
      name: 'wego-dev-strip-src-prefix',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url && req.url.startsWith('/src/')) {
            req.url = req.url.slice(4);
          }
          next();
        });
      },
    },
  ],
});
