/**
 * WeGO · RoutePreview.js
 * Sprint 11.6.3
 *
 * 二次确认预览组件（原生 JS）：
 *   - 展示完整路线预览（含景点字段状态）
 *   - 高亮缺失/异常字段
 *   - 「确认上传」/「继续编辑」/「取消」三按钮
 *
 * 使用方式：
 *   import { mountRoutePreview } from './RoutePreview.js';
 *   const { destroy } = mountRoutePreview({
 *     container: document.getElementById('preview-root'),
 *     sessionId: '...',
 *     route: { route_name, spots, gaps, ... },
 *     onConfirm: async (sessionId) => { ... },
 *     onContinueEditing: () => { ... },
 *     onCancel: () => { ... },
 *   });
 */

'use strict';

/* ============================================================
   样式
   ============================================================ */
const _STYLES = `
.rp-container {
  padding: 0 16px 24px;
  font-family: var(--font-body, 'Manrope', sans-serif);
}
.rp-header { margin-bottom: 16px; }
.rp-title {
  font-family: var(--font-head, 'Noto Serif SC', serif);
  font-size: 22px;
  font-weight: 700;
  color: var(--clr-on-surface, #1b1c1d);
  margin-bottom: 4px;
}
.rp-subtitle { font-size: 13px; color: var(--clr-text-muted, #6b6e72); }

/* 路线总览卡 */
.rp-route-card {
  background: var(--clr-card, #fff);
  border-radius: var(--radius-lg, 16px);
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: var(--shadow-card, 0 12px 32px rgba(27,28,29,0.04));
}
.rp-route-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.rp-route-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--clr-on-surface, #1b1c1d);
  font-family: var(--font-head, 'Noto Serif SC', serif);
}
.rp-spot-count {
  font-size: 12px;
  color: var(--clr-text-muted, #6b6e72);
  background: var(--clr-surface-variant, #e4e2e3);
  padding: 2px 8px;
  border-radius: 20px;
}
.rp-route-stay { font-size: 12px; color: var(--clr-text-muted, #6b6e72); margin-bottom: 6px; }
.rp-gap-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #FFF8E8;
  border-radius: 8px;
  font-size: 12px;
  color: var(--clr-accent, #c17f2c);
  margin-top: 6px;
}

/* 景点列表 */
.rp-spots { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
.rp-empty { text-align: center; padding: 24px; color: var(--clr-text-muted, #6b6e72); font-size: 14px; }

.rp-spot-card {
  background: var(--clr-card, #fff);
  border-radius: var(--radius-md, 12px);
  overflow: hidden;
  box-shadow: var(--shadow-card, 0 12px 32px rgba(27,28,29,0.04));
  border: 1px solid var(--clr-outline-variant, #e3beb8);
  transition: box-shadow 0.2s;
}
.rp-spot-card--open { box-shadow: var(--shadow-card-hover, 0 12px 32px rgba(27,28,29,0.08)); }

.rp-spot-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}
.rp-spot-num {
  width: 22px; height: 22px;
  border-radius: 50%;
  background: var(--clr-primary, #b22314);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.rp-spot-name {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: var(--clr-on-surface, #1b1c1d);
  display: flex;
  align-items: center;
  gap: 4px;
}
.rp-spot-warning-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--clr-accent, #c17f2c);
  flex-shrink: 0;
}
.rp-spot-meta-short { font-size: 12px; color: var(--clr-text-muted, #6b6e72); }
.rp-spot-chevron { color: var(--clr-text-muted, #6b6e72); transition: transform 0.2s; flex-shrink: 0; }
.rp-spot-chevron--up { transform: rotate(180deg); }
.rp-missing-text { color: var(--clr-danger, #c42b2b); font-style: italic; }
.rp-warning-text { color: var(--clr-accent, #c17f2c); }

.rp-spot-detail { border-top: 1px solid var(--clr-outline-variant, #e3beb8); padding: 10px 14px; }
.rp-spot-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.rp-spot-table th {
  text-align: left;
  color: var(--clr-text-muted, #6b6e72);
  font-weight: 500;
  padding: 4px 0;
  width: 100px;
  vertical-align: top;
}
.rp-spot-table td {
  color: var(--clr-on-surface, #1b1c1d);
  padding: 4px 0;
  vertical-align: top;
}
.rp-row--warn td { background: #FFF8E8; }
.rp-row--error td { background: #FFF0F0; }
.rp-field-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
}
.rp-field-badge--missing { background: #FFF0F0; color: var(--clr-danger, #c42b2b); }
.rp-field-badge--warning { background: #FFF8E8; color: var(--clr-accent, #c17f2c); }

/* 操作区 */
.rp-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
.rp-btn {
  padding: 12px 28px;
  border-radius: var(--radius-pill, 999px);
  font-size: 15px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}
.rp-btn--primary { background: var(--clr-primary, #b22314); color: #fff; }
.rp-btn--primary:not(:disabled):hover { background: var(--clr-primary-container, #d53d2a); }
.rp-btn--secondary { background: transparent; color: var(--clr-primary, #b22314); border: 1.5px solid var(--clr-primary, #b22314); }
.rp-btn--secondary:hover { background: var(--clr-primary-light, #f5ebe9); }
.rp-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.rp-status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  color: var(--clr-text-muted, #6b6e72);
  font-size: 14px;
}
.rp-spinner {
  width: 24px; height: 24px;
  border: 2.5px solid var(--clr-outline-variant, #e3beb8);
  border-top-color: var(--clr-primary, #b22314);
  border-radius: 50%;
  animation: rp-spin 0.8s linear infinite;
}
@keyframes rp-spin { to { transform: rotate(360deg); } }

.rp-error-wrap,
.rp-success-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
}
.rp-error-msg { color: var(--clr-danger, #c42b2b); font-size: 14px; text-align: center; }
.rp-success-icon { font-size: 48px; }
.rp-success-wrap p { font-size: 16px; color: var(--clr-primary, #b22314); font-weight: 700; }

.rp-footer { text-align: center; margin-top: 8px; }
.rp-footer .rp-btn--ghost {
  background: transparent;
  color: var(--clr-text-muted, #6b6e72);
  border: none;
  font-size: 13px;
  padding: 8px;
  text-decoration: underline;
  cursor: pointer;
}
`;

/* ============================================================
   mount 函数
   ============================================================ */
export function mountRoutePreview({ container, sessionId, route, onConfirm, onContinueEditing, onCancel } = {}) {
  if (!container) throw new Error('[RoutePreview] container 为必填');

  if (!document.getElementById('rp-styles')) {
    const s = document.createElement('style');
    s.id = 'rp-styles';
    s.textContent = _STYLES;
    document.head.appendChild(s);
  }

  let phase = 'idle'; // idle | submitting | done | error
  let errorMsg = '';
  let expandedSpot = null;

  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'rp-container';
  container.appendChild(wrap);

  function render() {
    wrap.innerHTML = '';
    renderHeader();
    renderRouteCard();
    renderSpots();
    renderActions();
    renderFooter();
  }

  /* ---- Header ---- */
  function renderHeader() {
    const h = document.createElement('div');
    h.className = 'rp-header';
    h.innerHTML = `
      <h2 class="rp-title">路线预览</h2>
      <p class="rp-subtitle">请核对以下信息，确认无误后提交入库</p>
    `;
    wrap.appendChild(h);
  }

  /* ---- 路线总览卡 ---- */
  function renderRouteCard() {
    const spots = route.spots || [];
    const totalStay = spots.reduce((s, sp) => s + (sp.estimated_stay_min || 0), 0);
    const gaps = route.gaps || [];
    const objGaps = gaps.filter(g => g.gap_type === 'objective').length;
    const subGaps = gaps.filter(g => g.gap_type === 'subjective').length;

    const card = document.createElement('div');
    card.className = 'rp-route-card';
    card.innerHTML = `
      <div class="rp-route-meta-row">
        <h3 class="rp-route-name">${escHtml(route.route_name || '未命名路线')}</h3>
        <span class="rp-spot-count">${spots.length} 个景点</span>
      </div>
      ${totalStay > 0 ? `<p class="rp-route-stay">约停留 ${totalStay} 分钟</p>` : ''}
      ${gaps.length > 0 ? `
        <div class="rp-gap-summary">
          <span>⚠️</span>
          <span>存在 ${objGaps} 项必填缺失、${subGaps} 项待确认</span>
        </div>` : ''}
    `;
    wrap.appendChild(card);
  }

  /* ---- 景点列表 ---- */
  function renderSpots() {
    const spots = route.spots || [];
    const gapMap = new Map();
    (route.gaps || []).forEach(g => gapMap.set(g.field, g));

    const list = document.createElement('div');
    list.className = 'rp-spots';

    if (spots.length === 0) {
      list.innerHTML = '<p class="rp-empty">暂无景点数据</p>';
      wrap.appendChild(list);
      return;
    }

    spots.forEach((spot, idx) => {
      const isOpen = expandedSpot === idx;
      const gapFor = (field) => gapMap.get(`${idx}:${field}`) || gapMap.get(field);

      const nameStatus = fieldStatus(gapFor('name'), spot.name);
      const latStatus  = fieldStatus(gapFor('lat'),  spot.lat);
      const lngStatus  = fieldStatus(gapFor('lng'),  spot.lng);
      const stayStatus = fieldStatus(gapFor('estimated_stay_min'), spot.estimated_stay_min);

      const spotGaps = (route.gaps || []).filter(g => String(g.field).startsWith(`${idx}:`));

      const card = document.createElement('div');
      card.className = `rp-spot-card${isOpen ? ' rp-spot-card--open' : ''}`;

      const hasWarning = nameStatus !== 'ok' || latStatus !== 'ok';

      card.innerHTML = `
        <button class="rp-spot-header" aria-expanded="${isOpen}">
          <span class="rp-spot-num">${idx + 1}</span>
          <span class="rp-spot-name">
            ${spot.name
              ? escHtml(spot.name)
              : `<em class="rp-missing-text">景点名称缺失</em>`}
            ${hasWarning ? '<span class="rp-spot-warning-dot" aria-label="有缺失字段"></span>' : ''}
          </span>
          <span class="rp-spot-meta-short">${spot.estimated_stay_min ? `${spot.estimated_stay_min}min` : '—'}</span>
          <svg class="rp-spot-chevron${isOpen ? ' rp-spot-chevron--up' : ''}" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        ${isOpen ? `
          <div class="rp-spot-detail">
            <table class="rp-spot-table">
              <tbody>
                ${rowHtml('景点名称', spot.name || '<em class="rp-missing-text">缺失</em>', nameStatus)}
                ${rowHtml('纬度 lat', spot.lat !== undefined ? spot.lat : '<em class="rp-missing-text">缺失</em>', latStatus)}
                ${rowHtml('经度 lng', spot.lng !== undefined ? spot.lng : '<em class="rp-missing-text">缺失</em>', lngStatus)}
                ${rowHtml('建议停留', spot.estimated_stay_min ? `${spot.estimated_stay_min} 分钟` : '<em class="rp-missing-text">未填</em>', stayStatus)}
                ${spot.sort_order !== undefined ? rowHtml('排序', spot.sort_order, 'ok') : ''}
                ${spot.tags ? rowHtml('标签', (Array.isArray(spot.tags) ? spot.tags : []).join('、'), 'ok') : ''}
                ${spot.short_desc ? rowHtml('简介', escHtml(spot.short_desc), 'ok') : ''}
                ${spotGaps.map(g => rowHtml(
                  g.field,
                  g.gap_type === 'objective'
                    ? '<em class="rp-missing-text">客观缺失，AI 无法自动补充</em>'
                    : `<em class="rp-warning-text">${escHtml(g.message)}</em>`,
                  g.gap_type === 'objective' ? 'error' : 'warn'
                )).join('')}
              </tbody>
            </table>
          </div>` : ''}
      `;

      card.querySelector('.rp-spot-header').addEventListener('click', () => {
        expandedSpot = isOpen ? null : idx;
        render();
      });

      list.appendChild(card);
    });

    wrap.appendChild(list);
  }

  /* ---- 操作区 ---- */
  function renderActions() {
    const div = document.createElement('div');
    div.className = 'rp-actions';

    if (phase === 'idle') {
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'rp-btn rp-btn--primary';
      confirmBtn.textContent = '确认上传';
      confirmBtn.addEventListener('click', handleConfirm);
      div.appendChild(confirmBtn);

      if (onContinueEditing) {
        const contBtn = document.createElement('button');
        contBtn.className = 'rp-btn rp-btn--secondary';
        contBtn.textContent = '继续编辑';
        contBtn.addEventListener('click', onContinueEditing);
        div.appendChild(contBtn);
      }
    } else if (phase === 'submitting') {
      div.innerHTML = `
        <div class="rp-status">
          <div class="rp-spinner" aria-hidden="true"></div>
          <span>正在提交…</span>
        </div>
      `;
    } else if (phase === 'error') {
      div.innerHTML = `
        <div class="rp-error-wrap">
          <p class="rp-error-msg">${escHtml(errorMsg)}</p>
          <button class="rp-btn rp-btn--primary">重试</button>
        </div>
      `;
      div.querySelector('button').addEventListener('click', () => { phase = 'idle'; render(); });
    } else if (phase === 'done') {
      div.innerHTML = `
        <div class="rp-success-wrap">
          <span class="rp-success-icon" aria-hidden="true">✅</span>
          <p>路线已提交审核！</p>
        </div>
      `;
    }

    wrap.appendChild(div);
  }

  /* ---- Footer ---- */
  function renderFooter() {
    if (!onCancel || phase !== 'idle') return;
    const f = document.createElement('div');
    f.className = 'rp-footer';
    const btn = document.createElement('button');
    btn.className = 'rp-btn--ghost';
    btn.textContent = '取消';
    btn.addEventListener('click', onCancel);
    f.appendChild(btn);
    wrap.appendChild(f);
  }

  /* ---- 确认上传 ---- */
  async function handleConfirm() {
    if (!onConfirm) return;
    phase = 'submitting';
    render();
    try {
      await onConfirm(sessionId);
      phase = 'done';
      render();
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      phase = 'error';
      render();
    }
  }

  /* ---- 工具 ---- */
  function fieldStatus(gap, value) {
    if (gap) return gap.gap_type === 'subjective' ? 'warning' : 'missing';
    if (value === undefined || value === null || value === '') return 'missing';
    return 'ok';
  }

  function rowHtml(label, value, status) {
    const cls = status === 'ok' ? '' : status === 'warning' ? ' rp-row--warn' : ' rp-row--error';
    const badge = status === 'missing'
      ? '<span class="rp-field-badge rp-field-badge--missing">必填缺失</span>'
      : status === 'warning'
      ? '<span class="rp-field-badge rp-field-badge--warning">待确认</span>'
      : '';
    return `<tr class="${cls}"><th>${escHtml(label)}</th><td>${value}${badge}</td></tr>`;
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
