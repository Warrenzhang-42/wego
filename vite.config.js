const path = require('path');
const { defineConfig } = require('vite');

/**
 * dev 命令使用 root = src，页面 URL 应为 /ai-chat.html，而不是 /src/ai-chat.html。
 * 仓库路径习惯带 src/，中间件把 /src/* 重写为 /*，避免误开成首页或其它回退页。
 */
module.exports = defineConfig({
  root: path.resolve(__dirname, 'src'),
  /** 多 HTML 入口；避免把不存在的路径当成 SPA 回退到 index.html */
  appType: 'mpa',
  plugins: [
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
