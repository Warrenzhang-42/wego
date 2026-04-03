/**
 * WeGO · GapFillingChat.js
 * Sprint 11.6.2
 *
 * Gap 补全对话组件（原生 JS）：
 *   - 客观 Gap：自动展示 AI 查询结果
 *   - 主观 Gap：渲染询问消息 + 用户回复输入框
 *   - 提交后触发 onComplete 或继续下一轮
 *
 * 使用方式：
 *   import { mountGapFillingChat } from './GapFillingChat.js';
 *   const { destroy } = mountGapFillingChat({
 *     container: document.getElementById('gap-chat-root'),
 *     sessionId: '...',
 *     gaps: [...],
 *     onComplete: (sessionId, route) => { ... },
 *     onCancel: () => { ... },
 *   });
 */

'use strict';

/* ============================================================
   样式
   ============================================================ */
const _STYLES = `
.gfc-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: var(--font-body, 'Manrope', sans-serif);
}
.gfc-header {
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--clr-outline-variant, #e3beb8);
  background: var(--clr-surface-container-low, #f5f3f4);
}
.gfc-title {
  font-family: var(--font-head, 'Noto Serif SC', serif);
  font-size: 18px;
  font-weight: 700;
  color: var(--clr-on-surface, #1b1c1d);
  margin-bottom: 4px;
}
.gfc-subtitle {
  font-size: 12px;
  color: var(--clr-text-muted, #6b6e72);
  margin-bottom: 8px;
}
.gfc-progress {
  display: flex;
  gap: 6px;
  align-items: center;
}
.gfc-progress-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--clr-outline-variant, #e3beb8);
  transition: background 0.2s;
}
.gfc-progress-dot.active { background: var(--clr-primary, #b22314); }
.gfc-progress-dot.done   { background: var(--clr-accent, #c17f2c); }

.gfc-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.gfc-message-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.gfc-message-row.user  { flex-direction: row-reverse; }
.gfc-avatar {
  width: 28px; height: 28px;
  border-radius: 50%;
  background: var(--clr-primary, #b22314);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-family: var(--font-head, 'Noto Serif SC', serif);
}
.gfc-message-row.ai .gfc-avatar { background: var(--clr-surface-container-high, #ebe8e9); color: var(--clr-primary, #b22314); }
.gfc-bubble {
  max-width: 75%;
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.5;
}
.gfc-message-row.ai .gfc-bubble {
  background: var(--clr-card, #fff);
  border-bottom-left-radius: 4px;
  color: var(--clr-on-surface, #1b1c1d);
  box-shadow: 0 2px 8px rgba(27,28,29,0.06);
}
.gfc-message-row.user .gfc-bubble {
  background: var(--clr-primary, #b22314);
  color: #fff;
  border-bottom-right-radius: 4px;
}
.gfc-suggested {
  margin-top: 6px;
  padding: 6px 10px;
  background: var(--clr-primary-light, #f5ebe9);
  border-radius: 8px;
  font-size: 12px;
  color: var(--clr-text-muted, #6b6e72);
}
.gfc-suggested-label { font-weight: 600; margin-right: 4px; }
.gfc-typing-indicator {
  display: flex; gap: 4px; align-items: center; padding: 4px 0;
}
.gfc-typing-indicator span {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--clr-text-muted, #6b6e72);
  animation: gfc-typing 1.2s infinite;
}
.gfc-typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.gfc-typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
@keyframes gfc-typing {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30%            { transform: translateY(-4px); opacity: 1; }
}
.gfc-bubble--error { background: #fff0f0 !important; border: 1px solid var(--clr-danger, #c42b2b) !important; color: var(--clr-danger, #c42b2b) !important; }
.gfc-retry-btn {
  margin-top: 8px;
  padding: 4px 12px;
  border: 1px solid var(--clr-danger, #c42b2b);
  border-radius: 20px;
  background: transparent;
  color: var(--clr-danger, #c42b2b);
  font-size: 12px;
  cursor: pointer;
}

.gfc-input-area {
  padding: 10px 12px 12px;
  border-top: 1px solid var(--clr-outline-variant, #e3beb8);
  background: var(--clr-surface-container-low, #f5f3f4);
}
.gfc-input-hint {
  font-size: 12px;
  color: var(--clr-text-muted, #6b6e72);
  margin-bottom: 6px;
}
.gfc-input-hint strong { color: var(--clr-primary, #b22314); }
.gfc-hint-suggest { margin-left: 4px; color: var(--clr-accent, #c17f2c); }
.gfc-input-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.gfc-textarea {
  flex: 1;
  border: 1.5px solid var(--clr-outline-variant, #e3beb8);
  border-radius: 20px;
  padding: 10px 14px;
  font-size: 14px;
  font-family: inherit;
  resize: none;
  outline: none;
  background: var(--clr-card, #fff);
  color: var(--clr-on-surface, #1b1c1d);
  max-height: 100px;
  transition: border-color 0.2s;
}
.gfc-textarea:focus { border-color: var(--clr-primary, #b22314); }
.gfc-textarea:disabled { opacity: 0.5; }
.gfc-send-btn {
  width: 40px; height: 40px;
  border-radius: 50%;
  border: none;
  background: var(--clr-primary, #b22314);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s;
}
.gfc-send-btn:disabled { background: var(--clr-outline-variant, #e3beb8); cursor: not-allowed; }
.gfc-send-btn:not(:disabled):hover { background: var(--clr-primary-container, #d53d2a); }

.gfc-footer {
  padding: 8px 16px 12px;
  text-align: center;
}
.gfc-cancel-btn {
  border: none;
  background: transparent;
  color: var(--clr-text-muted, #6b6e72);
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
  font-family: inherit;
}
`;

/* ============================================================
   mount 函数
   ============================================================ */
export function mountGapFillingChat({ container, sessionId, gaps = [], onComplete, onCancel } = {}) {
  if (!container) throw new Error('[GapFillingChat] container 为必填');

  if (!document.getElementById('gfc-styles')) {
    const s = document.createElement('style');
    s.id = 'gfc-styles';
    s.textContent = _STYLES;
    document.head.appendChild(s);
  }

  const objectiveGaps = gaps.filter(g => g.gap_type === 'objective');
  const subjectiveGaps = gaps.filter(g => g.gap_type === 'subjective');
  let pendingIndex = 0;

  const messages = [];

  // 初始消息：客观 Gap 自动展示
  objectiveGaps.forEach(g => {
    messages.push({ role: 'ai', content: g.message, suggested_value: g.suggested_value, field: g.field });
  });

  let phase = 'receiving'; // receiving | waiting_input | submitting | done | error
  let currentInput = '';
  let errorMsg = '';

  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'gfc-container';
  container.appendChild(wrap);

  function render() {
    wrap.innerHTML = '';
    renderHeader();
    renderMessages();
    renderInputArea();
    renderFooter();
  }

  /* ---- Header ---- */
  function renderHeader() {
    const h = document.createElement('div');
    h.className = 'gfc-header';
    let dots = '';
    if (subjectiveGaps.length > 0) {
      dots = subjectiveGaps.map((_, i) => {
        const cls = i < pendingIndex ? 'done' : i === pendingIndex ? 'active' : '';
        return `<span class="gfc-progress-dot${cls ? ' ' + cls : ''}"></span>`;
      }).join('');
    }
    h.innerHTML = `
      <h3 class="gfc-title">补充路线信息</h3>
      <p class="gfc-subtitle">以下信息缺失，AI 已自动查询了客观数据，还需要您补充几点：</p>
      ${subjectiveGaps.length > 0 ? `<div class="gfc-progress">${dots}</div>` : ''}
    `;
    wrap.appendChild(h);
  }

  /* ---- Messages ---- */
  function renderMessages() {
    const list = document.createElement('div');
    list.className = 'gfc-messages';
    list.id = 'gfc-messages';

    messages.forEach((msg, i) => {
      const row = document.createElement('div');
      row.className = `gfc-message-row ${msg.role}`;
      row.innerHTML = `
        <div class="gfc-avatar">${msg.role === 'ai' ? '小go' : '我'}</div>
        <div class="gfc-bubble">
          <div class="gfc-bubble-text">${escHtml(msg.content)}</div>
          ${msg.role === 'ai' && msg.suggested_value ? `
            <div class="gfc-suggested">
              <span class="gfc-suggested-label">系统已查询：</span>
              <span class="gfc-suggested-value">${escHtml(msg.suggested_value)}</span>
            </div>` : ''}
        </div>
      `;
      list.appendChild(row);
    });

    // 打字机动画
    if (phase === 'waiting_input' && subjectiveGaps.length > 0) {
      const aiMsg = subjectiveGaps[pendingIndex];
      messages.push({ role: 'ai', content: aiMsg.message, suggested_value: aiMsg.suggested_value, field: aiMsg.field });
      const row = document.createElement('div');
      row.className = 'gfc-message-row ai';
      row.id = 'gfc-typing-row';
      row.innerHTML = `
        <div class="gfc-avatar">小go</div>
        <div class="gfc-bubble">
          <div class="gfc-typing-indicator"><span></span><span></span><span></span></div>
        </div>
      `;
      list.appendChild(row);
      phase = 'waiting_input';
    }

    if (phase === 'submitting') {
      const row = document.createElement('div');
      row.className = 'gfc-message-row ai';
      row.innerHTML = `
        <div class="gfc-avatar">小go</div>
        <div class="gfc-bubble">
          <div class="gfc-typing-indicator"><span></span><span></span><span></span></div>
        </div>
      `;
      list.appendChild(row);
    }

    if (phase === 'error') {
      const row = document.createElement('div');
      row.className = 'gfc-message-row ai';
      row.innerHTML = `
        <div class="gfc-avatar">小go</div>
        <div class="gfc-bubble gfc-bubble--error">
          <div>提交失败：${escHtml(errorMsg)}</div>
          <button class="gfc-retry-btn">重试</button>
        </div>
      `;
      row.querySelector('.gfc-retry-btn').addEventListener('click', () => {
        phase = 'waiting_input';
        render();
      });
      list.appendChild(row);
    }

    wrap.appendChild(list);
    list.scrollTop = list.scrollHeight;
  }

  /* ---- Input Area ---- */
  function renderInputArea() {
    if (phase !== 'waiting_input' || subjectiveGaps.length === 0) return;
    const gap = subjectiveGaps[pendingIndex];
    const area = document.createElement('div');
    area.className = 'gfc-input-area';
    area.innerHTML = `
      ${gap ? `<div class="gfc-input-hint">请补充：<strong>${escHtml(gap.field)}</strong>${gap.suggested_value ? `<span class="gfc-hint-suggest">（参考：${escHtml(gap.suggested_value)}）</span>` : ''}</div>` : ''}
      <div class="gfc-input-row">
        <textarea class="gfc-textarea" placeholder="输入您的回答…" rows="2" ${phase !== 'waiting_input' ? 'disabled' : ''}></textarea>
        <button class="gfc-send-btn" aria-label="发送" ${phase !== 'waiting_input' ? 'disabled' : ''}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    `;

    const ta = area.querySelector('.gfc-textarea');
    const btn = area.querySelector('.gfc-send-btn');

    ta.addEventListener('input', () => {
      currentInput = ta.value;
      btn.disabled = !currentInput.trim();
    });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitAnswer();
      }
    });
    btn.addEventListener('click', submitAnswer);
    wrap.appendChild(area);
  }

  /* ---- Footer ---- */
  function renderFooter() {
    if (!onCancel) return;
    const f = document.createElement('div');
    f.className = 'gfc-footer';
    const btn = document.createElement('button');
    btn.className = 'gfc-cancel-btn';
    btn.textContent = '取消上传';
    btn.addEventListener('click', onCancel);
    f.appendChild(btn);
    wrap.appendChild(f);
  }

  /* ---- 提交答案 ---- */
  async function submitAnswer() {
    const text = currentInput.trim();
    if (!text || phase !== 'waiting_input') return;
    const gap = subjectiveGaps[pendingIndex];

    messages.push({ role: 'user', content: text });
    currentInput = '';
    phase = 'submitting';
    render();

    try {
      const api = window.__WEGO_API_CONFIG__ || {};
      const pub = window.__WEGO_CONFIG__ || {};
      const base = pub.supabaseUrl || api.supabaseUrl || '';
      const fnUrl = `${base}/functions/v1/route-ingest/${sessionId}/confirm`;

      const overrides = subjectiveGaps.slice(0, pendingIndex + 1).map((g, idx) => ({
        field: g.field,
        value: idx === pendingIndex ? text : (g._userOverride || ''),
      }));

      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${pub.supabaseAnonKey || api.supabaseAnonKey || ''}`,
        },
        body: JSON.stringify({ confirmed: true, overrides }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err || {}).error || `HTTP ${res.status}`);
      }

      /** @type {{ route_preview: Object, status: string }} */
      const result = await res.json();

      pendingIndex += 1;

      if (result.status === 'has_gaps' && result.route_preview?.gaps?.some(g => g.gap_type === 'subjective')) {
        const remaining = result.route_preview.gaps.filter(g => g.gap_type === 'subjective');
        subjectiveGaps.length = 0;
        subjectiveGaps.push(...remaining);
        messages.push({
          role: 'ai',
          content: remaining[0].message,
          suggested_value: remaining[0].suggested_value,
          field: remaining[0].field,
        });
        phase = 'waiting_input';
        render();
      } else {
        phase = 'done';
        render();
        onComplete?.(sessionId, result.route_preview);
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      phase = 'error';
      render();
    }
  }

  // 初始化：如果第一个主观 Gap 还没有作为消息加入
  if (subjectiveGaps.length > 0) {
    const firstGap = subjectiveGaps[0];
    messages.push({
      role: 'ai',
      content: firstGap.message,
      suggested_value: firstGap.suggested_value,
      field: firstGap.field,
    });
    phase = 'waiting_input';
  } else if (objectiveGaps.length > 0) {
    phase = 'done';
    onComplete?.(sessionId, { route_name: '', spots: [], gaps, raw: {} });
    return { destroy: () => wrap.remove() };
  }

  render();
  return { destroy: () => wrap.remove() };
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
