/**
 * WeGO · 后台「路线上传」面板
 * 流程：文件 → Edge route-ingest → Agent 解析 → Gap 补充 → 确认入库（与前台原 upload-route 一致）。
 */
import { mountRouteUploader } from './components/RouteUploader.js';
import { mountGapFillingChat } from './components/GapFillingChat.js';
import { mountRoutePreview } from './components/RoutePreview.js';

function getIngestConfig() {
  const cfg = window.__WEGO_API_CONFIG__ || {};
  return {
    supabaseUrl: cfg.supabaseUrl || '',
    supabaseAnonKey: cfg.supabaseAnonKey || '',
  };
}

let uploadState = {
  phase: 'idle',
  sessionId: '',
  gaps: [],
  route: null,
};

let currentDestroy = null;
let viewListEl = null;
let viewUploadEl = null;
let tabBtns = [];

function getEls() {
  return {
    main: document.getElementById('admin-ur-main'),
    navTitle: document.getElementById('admin-ur-nav-title'),
    backBtn: document.getElementById('admin-ur-back-btn'),
  };
}

function setTitle(text) {
  const { navTitle } = getEls();
  if (navTitle) navTitle.textContent = text;
}

function setViewVisibility(view) {
  const isList = view === 'list';
  if (viewListEl) viewListEl.hidden = !isList;
  if (viewUploadEl) viewUploadEl.hidden = isList;
  tabBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-admin-view') === view);
  });
}

function navigateUpload() {
  const { main, backBtn } = getEls();
  if (!main) return;

  if (currentDestroy) {
    currentDestroy();
    currentDestroy = null;
  }
  main.innerHTML = '';

  const goList = () => applyAdminView('list');

  if (uploadState.phase === 'idle') {
    setTitle('上传路线');
    currentDestroy = mountRouteUploader({
      container: main,
      onGapStart,
      onUploaded,
      onCancel: goList,
    }).destroy;
  } else if (uploadState.phase === 'gap_filling') {
    setTitle('补充信息（Agent 引导）');
    currentDestroy = mountGapFillingChat({
      container: main,
      sessionId: uploadState.sessionId,
      gaps: uploadState.gaps,
      onComplete: onGapComplete,
      onCancel: goList,
    }).destroy;
  } else if (uploadState.phase === 'preview') {
    setTitle('确认上传');
    currentDestroy = mountRoutePreview({
      container: main,
      sessionId: uploadState.sessionId,
      route: uploadState.route,
      onConfirm: onConfirm,
      onContinueEditing: () => {
        uploadState.phase = 'idle';
        navigateUpload();
      },
      onCancel: goList,
    }).destroy;
  } else if (uploadState.phase === 'done') {
    setTitle('上传完成');
    main.innerHTML = `
      <div class="admin-ur-done">
        <div class="admin-ur-done-icon" aria-hidden="true">
          <svg width="72" height="72" viewBox="0 0 80 80" fill="none">
            <circle cx="40" cy="40" r="40" fill="#f5ebe9"/>
            <circle cx="40" cy="40" r="28" fill="#b22314" fill-opacity="0.12"/>
            <path d="M26 40L35 49L54 30" stroke="#b22314" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h2 class="admin-ur-done-title">提交成功</h2>
        <p class="admin-ur-done-desc">路线已提交审核；审核通过后将入库并对用户可见。</p>
        <button type="button" class="btn btn-primary" id="admin-ur-done-list">返回路线列表</button>
      </div>
    `;
    document.getElementById('admin-ur-done-list').addEventListener('click', () => {
      applyAdminView('list');
    });
  }

  if (backBtn) {
    backBtn.style.visibility =
      uploadState.phase === 'idle' || uploadState.phase === 'done' ? 'hidden' : 'visible';
  }
}

function onGapStart(sessionId, gaps) {
  uploadState.sessionId = sessionId;
  uploadState.gaps = gaps;
  uploadState.phase = 'gap_filling';
  navigateUpload();
}

function onUploaded(sessionId, route) {
  uploadState.sessionId = sessionId;
  uploadState.route = route;
  uploadState.phase = 'preview';
  navigateUpload();
}

function onGapComplete(sessionId, route) {
  uploadState.sessionId = sessionId;
  uploadState.route = route;
  uploadState.phase = 'preview';
  navigateUpload();
}

async function onConfirm(sessionId) {
  const { supabaseUrl, supabaseAnonKey } = getIngestConfig();
  const fnUrl = `${supabaseUrl}/functions/v1/route-ingest/${sessionId}/confirm`;
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey || ''}`,
    },
    body: JSON.stringify({ confirmed: true }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err || {}).error || `HTTP ${res.status}`);
  }
  uploadState.phase = 'done';
  navigateUpload();
}

function resetUploadFlow() {
  if (currentDestroy) {
    currentDestroy();
    currentDestroy = null;
  }
  const { main } = getEls();
  if (main) main.innerHTML = '';
  uploadState = { phase: 'idle', sessionId: '', gaps: [], route: null };
  setTitle('上传路线');
  const { backBtn } = getEls();
  if (backBtn) backBtn.style.visibility = 'hidden';
}

/** 供组件取消、深链返回列表使用 */
export function applyAdminView(view) {
  if (view === 'list') {
    if (location.hash === '#route-upload') {
      history.replaceState(null, '', location.pathname + location.search);
    }
    setViewVisibility('list');
    resetUploadFlow();
  } else if (view === 'upload') {
    if (location.hash !== '#route-upload') location.hash = 'route-upload';
    else {
      setViewVisibility('upload');
      navigateUpload();
    }
  }
}

function wireBackButtonOnce() {
  const { backBtn } = getEls();
  if (!backBtn || backBtn.dataset.wired) return;
  backBtn.dataset.wired = '1';
  backBtn.addEventListener('click', () => {
    if (uploadState.phase === 'idle' || uploadState.phase === 'done') {
      applyAdminView('list');
    } else if (uploadState.phase === 'gap_filling' || uploadState.phase === 'preview') {
      uploadState.phase = 'idle';
      navigateUpload();
    }
  });
}

function onHashChange() {
  if (location.hash === '#route-upload') {
    setViewVisibility('upload');
    navigateUpload();
  } else {
    setViewVisibility('list');
    resetUploadFlow();
  }
}

export function initAdminRouteUploadPanel() {
  viewListEl = document.getElementById('admin-view-list');
  viewUploadEl = document.getElementById('admin-view-upload');
  tabBtns = Array.from(document.querySelectorAll('[data-admin-view]'));
  wireBackButtonOnce();

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('data-admin-view');
      if (v === 'list' || v === 'upload') applyAdminView(v);
    });
  });

  window.addEventListener('hashchange', onHashChange);
  onHashChange();
}
