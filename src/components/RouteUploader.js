/**
 * WeGO · RouteUploader.js
 * Sprint 11.6.1
 *
 * 文件上传组件，支持四种上传模式：
 *   1. 拖拽 / 点击上传文件（JSON / MD / TXT）
 *   2. 纯文本粘贴
 *   3. URL 输入抓取
 *
 * 状态机：
 *   idle → uploading → parsing → gap_filling → preview → submitted / error
 *
 * 契约参考：
 *   - route-upload.schema.json  (上传请求)
 *   - route-ingestion.schema.json  (解析后路线预览)
 *
 * 使用方式（HTML 页面）：
 *   <div id="route-uploader-root"></div>
 *   <script type="module">
 *     import { mountRouteUploader } from './components/RouteUploader.js';
 *     mountRouteUploader({
 *       container: document.getElementById('route-uploader-root'),
 *       onGapStart: (sessionId, gaps) => { ... },
 *       onUploaded: (sessionId, route) => { ... },
 *       onCancel: () => { ... },
 *     });
 *   </script>
 */

'use strict';

/* ============================================================
   数据结构（与 TS 类型对应）
   ============================================================ */

/**
 * @typedef {Object} GapItem
 * @property {'objective'|'subjective'} gap_type
 * @property {string} field
 * @property {string} message
 * @property {boolean} [auto_queried]
 * @property {string} [suggested_value]
 * @property {string} [user_override]
 */

/**
 * @typedef {Object} ParsedRoute
 * @property {string} route_name
 * @property {Array<Object>} spots
 * @property {GapItem[]} gaps
 * @property {unknown} raw
 */

/**
 * @typedef {Object} UploadResult
 * @property {string} session_id
 * @property {'success'|'has_gaps'|'error'} status
 * @property {ParsedRoute} [route_preview]
 * @property {string} [error]
 */

/* ============================================================
   样式（注入到 document）
   ============================================================ */
const _UPLOADER_STYLES = `
.ru-container {
  padding: 0 16px 24px;
  font-family: var(--font-body, 'Manrope', sans-serif);
}
.ru-header { margin-bottom: 20px; }
.ru-title {
  font-family: var(--font-head, 'Noto Serif SC', serif);
  font-size: 22px;
  font-weight: 700;
  color: var(--clr-on-surface, #1b1c1d);
  margin-bottom: 4px;
}
.ru-subtitle {
  font-size: 13px;
  color: var(--clr-text-muted, #6b6e72);
}
.ru-mode-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  background: var(--clr-surface-variant, #e4e2e3);
  border-radius: var(--radius-pill, 999px);
  padding: 3px;
}
.ru-tab {
  flex: 1;
  border: none;
  background: transparent;
  padding: 8px 12px;
  border-radius: var(--radius-pill, 999px);
  font-size: 13px;
  font-weight: 600;
  color: var(--clr-text-muted, #6b6e72);
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}
.ru-tab--active {
  background: var(--clr-card, #fff);
  color: var(--clr-primary, #b22314);
  box-shadow: 0 2px 8px rgba(27,28,29,0.10);
}
.ru-dropzone {
  border: 2px dashed var(--clr-outline-variant, #e3beb8);
  border-radius: var(--radius-lg, 16px);
  padding: 40px 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  background: var(--clr-surface, #fbf9fa);
  user-select: none;
}
.ru-dropzone:hover,
.ru-dropzone--drag-over {
  border-color: var(--clr-primary, #b22314);
  background: var(--clr-primary-light, #f5ebe9);
}
.ru-dropzone-icon { margin-bottom: 12px; }
.ru-dropzone-hint { font-size: 14px; color: var(--clr-text-b, #3d3f42); margin-bottom: 6px; }
.ru-link { color: var(--clr-primary, #b22314); font-weight: 600; }
.ru-dropzone-formats { font-size: 12px; color: var(--clr-text-muted, #6b6e72); }

.ru-paste-wrap textarea,
.ru-textarea {
  width: 100%;
  border: 1.5px solid var(--clr-outline-variant, #e3beb8);
  border-radius: var(--radius-md, 12px);
  padding: 12px;
  font-size: 13px;
  font-family: 'Manrope', monospace;
  resize: vertical;
  margin-bottom: 10px;
  background: var(--clr-surface-container-lowest, #fff);
  color: var(--clr-on-surface, #1b1c1d);
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.ru-paste-wrap textarea:focus,
.ru-textarea:focus { border-color: var(--clr-primary, #b22314); }

.ru-input {
  width: 100%;
  border: 1.5px solid var(--clr-outline-variant, #e3beb8);
  border-radius: var(--radius-md, 12px);
  padding: 12px;
  font-size: 14px;
  font-family: inherit;
  margin-bottom: 10px;
  background: var(--clr-surface-container-lowest, #fff);
  color: var(--clr-on-surface, #1b1c1d);
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.ru-input:focus { border-color: var(--clr-primary, #b22314); }

.ru-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 20px;
  border-radius: var(--radius-pill, 999px);
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}
.ru-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.ru-btn--primary {
  background: var(--clr-primary, #b22314);
  color: #fff;
}
.ru-btn--primary:not(:disabled):hover { background: var(--clr-primary-container, #d53d2a); }
.ru-btn--ghost {
  background: transparent;
  color: var(--clr-text-muted, #6b6e72);
  border: 1.5px solid var(--clr-outline-variant, #e3beb8);
}
.ru-btn--ghost:hover { border-color: var(--clr-primary, #b22314); color: var(--clr-primary, #b22314); }
.ru-cancel-btn { margin-top: 8px; }

.ru-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  gap: 12px;
  text-align: center;
  color: var(--clr-text-muted, #6b6e72);
  font-size: 14px;
}
.ru-spinner {
  width: 36px; height: 36px;
  border: 3px solid var(--clr-outline-variant, #e3beb8);
  border-top-color: var(--clr-primary, #b22314);
  border-radius: 50%;
  animation: ru-spin 0.8s linear infinite;
}
@keyframes ru-spin { to { transform: rotate(360deg); } }

.ru-error-icon { font-size: 32px; }
.ru-error-msg { color: var(--clr-danger, #c42b2b); font-size: 14px; max-width: 280px; }
`;

/* ============================================================
   工厂函数：挂载上传器
   ============================================================ */
export function mountRouteUploader({ container, onGapStart, onUploaded, onCancel } = {}) {
  if (!container) throw new Error('[RouteUploader] container 为必填参数');

  // 注入样式（只注入一次）
  if (!document.getElementById('ru-styles')) {
    const style = document.createElement('style');
    style.id = 'ru-styles';
    style.textContent = _UPLOADER_STYLES;
    document.head.appendChild(style);
  }

  /* ---- 内部状态 ───────────────────────────────────── */
  let phase = 'idle'; // idle | uploading | parsing | gap_filling | preview | submitted | error
  let mode  = 'file'; // file | paste | url
  let errorMsg = '';

  /* ---- DOM 引用 ───────────────────────────────────── */
  container.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'ru-container';
  container.appendChild(wrap);

  function render() {
    wrap.innerHTML = '';
    renderHeader();
    renderTabs();
    if (phase === 'idle')     renderIdle();
    else if (phase === 'uploading' || phase === 'parsing') renderLoading();
    else if (phase === 'gap_filling') renderGapStub();
    else if (phase === 'error') renderError();
  }

  /* ---- Header ──────────────────────────────────────── */
  function renderHeader() {
    const h = document.createElement('div');
    h.className = 'ru-header';
    h.innerHTML = `
      <h2 class="ru-title">上传路线</h2>
      <p class="ru-subtitle">支持 JSON / Markdown / TXT 文件，或粘贴内容 / 输入网页 URL</p>
    `;
    wrap.appendChild(h);
  }

  /* ---- Mode Tabs ───────────────────────────────────── */
  function renderTabs() {
    if (phase !== 'idle') return;
    const tabs = document.createElement('div');
    tabs.className = 'ru-mode-tabs';
    tabs.setAttribute('role', 'tablist');
    ['file','paste','url'].forEach(m => {
      const btn = document.createElement('button');
      btn.className = `ru-tab${mode === m ? ' ru-tab--active' : ''}`;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', mode === m ? 'true' : 'false');
      btn.textContent = m === 'file' ? '📁 上传文件' : m === 'paste' ? '📝 粘贴内容' : '🔗 抓取URL';
      btn.addEventListener('click', () => { mode = m; render(); });
      tabs.appendChild(btn);
    });
    wrap.appendChild(tabs);
  }

  /* ---- Idle State ──────────────────────────────────── */
  function renderIdle() {
    if (mode === 'file') renderFileMode();
    else if (mode === 'paste') renderPasteMode();
    else if (mode === 'url') renderUrlMode();
    if (onCancel) {
      const cancel = document.createElement('button');
      cancel.className = 'ru-btn ru-btn--ghost ru-cancel-btn';
      cancel.textContent = '取消';
      cancel.addEventListener('click', onCancel);
      wrap.appendChild(cancel);
    }
  }

  function renderFileMode() {
    const zone = document.createElement('div');
    zone.className = 'ru-dropzone';
    zone.setAttribute('role', 'button');
    zone.setAttribute('tabindex', '0');
    zone.setAttribute('aria-label', '点击选择文件或将文件拖拽到此处');
    zone.innerHTML = `
      <div class="ru-dropzone-icon">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect width="48" height="48" rx="12" fill="var(--clr-primary-light, #f5ebe9)"/>
          <path d="M24 30V18M24 18L19 23M24 18L29 23" stroke="var(--clr-primary, #b22314)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M16 32H32" stroke="var(--clr-primary, #b22314)" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
      </div>
      <p class="ru-dropzone-hint">将文件拖拽到此处，或<span class="ru-link">点击选择</span></p>
      <p class="ru-dropzone-formats">支持 .json · .md · .txt</p>
    `;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('ru-dropzone--drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('ru-dropzone--drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('ru-dropzone--drag-over');
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    });
    zone.addEventListener('click', () => {
      const input = document.getElementById('__ru_file_input__');
      if (input) input.click();
    });
    zone.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const input = document.getElementById('__ru_file_input__');
        if (input) input.click();
      }
    });
    wrap.appendChild(zone);

    const hiddenInput = document.createElement('input');
    hiddenInput.id = '__ru_file_input__';
    hiddenInput.type = 'file';
    hiddenInput.accept = '.json,.md,.txt';
    hiddenInput.style.display = 'none';
    hiddenInput.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      hiddenInput.value = '';
    });
    wrap.appendChild(hiddenInput);
  }

  function renderPasteMode() {
    const div = document.createElement('div');
    div.className = 'ru-paste-wrap';
    const ta = document.createElement('textarea');
    ta.className = 'ru-textarea';
    ta.placeholder = '粘贴路线内容，例如：\n{\n  "title": "我的路线",\n  "spots": [...]\n}\n\n或直接粘贴 Markdown 格式的路线介绍';
    ta.rows = 10;
    let text = '';
    ta.addEventListener('input', () => { text = ta.value; btn.disabled = !text.trim(); });
    const btn = document.createElement('button');
    btn.className = 'ru-btn ru-btn--primary';
    btn.textContent = '提交内容';
    btn.disabled = true;
    btn.addEventListener('click', () => submitPaste(text.trim()));
    div.appendChild(ta);
    div.appendChild(btn);
    wrap.appendChild(div);
  }

  function renderUrlMode() {
    const div = document.createElement('div');
    div.className = 'ru-url-wrap';
    const input = document.createElement('input');
    input.className = 'ru-input';
    input.type = 'url';
    input.placeholder = '输入网页 URL，例如 https://...';
    let url = '';
    input.addEventListener('input', () => { url = input.value; btn.disabled = !url.trim(); });
    const btn = document.createElement('button');
    btn.className = 'ru-btn ru-btn--primary';
    btn.textContent = '抓取内容';
    btn.disabled = true;
    btn.addEventListener('click', () => submitUrl(url.trim()));
    div.appendChild(input);
    div.appendChild(btn);
    wrap.appendChild(div);
  }

  /* ---- Loading ─────────────────────────────────────── */
  function renderLoading() {
    const div = document.createElement('div');
    div.className = 'ru-status ru-status--loading';
    div.innerHTML = `
      <div class="ru-spinner" aria-hidden="true"></div>
      <p>${phase === 'uploading' ? '正在上传…' : '正在解析内容…'}</p>
    `;
    wrap.appendChild(div);
  }

  /* ---- Gap Filling Stub (delegates to GapFillingChat) ── */
  async function renderGapStub() {
    // Gap 填写阶段由页面级 JS 控制，此处仅显示占位
    const div = document.createElement('div');
    div.className = 'ru-status';
    div.style.cssText = 'padding:24px;text-align:center;';
    div.innerHTML = `
      <p style="font-size:14px;color:var(--clr-text-muted)">即将进入信息补全环节…</p>
    `;
    wrap.appendChild(div);
  }

  /* ---- Error ───────────────────────────────────────── */
  function renderError() {
    const div = document.createElement('div');
    div.className = 'ru-status ru-status--error';
    div.innerHTML = `
      <span class="ru-error-icon" aria-hidden="true">⚠️</span>
      <p class="ru-error-msg">${escHtml(errorMsg)}</p>
      <button class="ru-btn ru-btn--ghost">重新上传</button>
    `;
    div.querySelector('button').addEventListener('click', () => { phase = 'idle'; render(); });
    wrap.appendChild(div);
    if (onCancel) {
      const cancel = document.createElement('button');
      cancel.className = 'ru-btn ru-btn--ghost ru-cancel-btn';
      cancel.textContent = '取消';
      cancel.addEventListener('click', onCancel);
      wrap.appendChild(cancel);
    }
  }

  /* ============================================================
     核心：提交 Payload
     ============================================================ */
  function getFnUrl() {
    const cfg = window.__WEGO_CONFIG__ || {};
    const base = cfg.supabaseUrl || '';
    return `${base}/functions/v1/route-ingest`;
  }

  function getAnonKey() {
    return (window.__WEGO_CONFIG__ || {}).supabaseAnonKey || '';
  }

  async function submitPayload(payload) {
    phase = 'uploading';
    render();
    try {
      phase = 'parsing';
      render();

      const fnUrl = getFnUrl();
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAnonKey()}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err || {}).error || `HTTP ${res.status}`);
      }

      /** @type {UploadResult} */
      const result = await res.json();

      if (result.status === 'error') {
        throw new Error(result.error || '解析失败');
      }

      if (result.status === 'has_gaps' && result.route_preview?.gaps?.length) {
        phase = 'gap_filling';
        render();
        onGapStart?.(result.session_id, result.route_preview.gaps);
      } else {
        onUploaded?.(result.session_id, result.route_preview);
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      phase = 'error';
      render();
    }
  }

  /* ============================================================
     文件处理
     ============================================================ */
  async function handleFile(file) {
    let fileType;
    const name = file.name.toLowerCase();
    if (name.endsWith('.json')) fileType = 'json';
    else if (name.endsWith('.md')) fileType = 'markdown';
    else if (name.endsWith('.txt')) fileType = 'txt';
    else {
      errorMsg = '仅支持 .json / .md / .txt 文件';
      phase = 'error';
      render();
      return;
    }
    const text = await file.text();
    await submitPayload({
      session_id: crypto.randomUUID(),
      file_content: text,
      file_type: fileType,
    });
  }

  async function submitPaste(text) {
    await submitPayload({
      session_id: crypto.randomUUID(),
      file_content: text,
      file_type: 'txt',
    });
  }

  async function submitUrl(raw) {
    let url = raw;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    await submitPayload({
      session_id: crypto.randomUUID(),
      file_content: url,
      file_type: 'url',
      source_url: url,
    });
  }

  /* ============================================================
     初始化
     ============================================================ */
  render();
  return { destroy: () => { wrap.remove(); } };
}

/* ============================================================
   辅助
   ============================================================ */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
