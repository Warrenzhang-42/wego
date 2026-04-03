/**
 * WeGO · upload-route/index.tsx
 * Sprint 11.6.4
 *
 * 独立上传页面，整合 RouteUploader / GapFillingChat / RoutePreview
 * 串联完整上传 → Gap 处理 → 确认流程。
 *
 * 路由：/upload-route
 */

'use strict';

import { createSignal } from 'react';
import { RouteUploader, GapFillingChat, RoutePreview } from '../../components/RouteUploader';
import type { ParsedRoute, GapItem } from '../../components/RouteUploader';

type PagePhase =
  | 'idle'          // 上传组件
  | 'gap_filling'   // Gap 填写
  | 'preview'       // 预览确认
  | 'done';         // 完成

export function UploadRoutePage() {
  const [phase, setPhase]           = createSignal<PagePhase>('idle');
  const [sessionId, setSessionId]   = createSignal('');
  const [gaps, setGaps]             = createSignal<GapItem[]>([]);
  const [parsedRoute, setParsedRoute] = createSignal<ParsedRoute | null>(null);

  /* ---- 阶段1→2：上传完成，进入 Gap 填写 --------- */
  function handleGapStart(sid: string, gapList: GapItem[]) {
    setSessionId(sid);
    setGaps(gapList);
    setPhase('gap_filling');
  }

  /* ---- 阶段1→3（无主观Gap）：直接进入预览 --------- */
  function handleUploadComplete(sid: string, route: ParsedRoute) {
    setSessionId(sid);
    setParsedRoute(route);
    setPhase('preview');
  }

  /* ---- 阶段2→3：Gap 填写完成，进入预览 --------- */
  function handleGapComplete(sid: string, route: ParsedRoute) {
    setSessionId(sid);
    setParsedRoute(route);
    setPhase('preview');
  }

  /* ---- 阶段3：确认上传 --------- */
  async function handleConfirm(sessionId: string) {
    const baseUrl = (window.__WEGO_CONFIG__?.supabaseUrl)
      ? `https://${(window.__WEGO_CONFIG__ as { supabaseUrl: string }).supabaseUrl.replace('https://', '')}`
      : '';
    const fnUrl = `${baseUrl}/functions/v1/route-ingest/${sessionId}/confirm`;

    const res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(window.__WEGO_CONFIG__ as { supabaseAnonKey?: string })?.supabaseAnonKey || ''}`,
      },
      body: JSON.stringify({ confirmed: true }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
    }
    // 成功
    setPhase('done');
  }

  /* ---- 返回上传阶段 --------- */
  function handleContinueEditing() {
    setPhase('idle');
  }

  /* ---- 取消，返回首页 --------- */
  function handleCancel() {
    window.location.href = 'index.html';
  }

  /* ============================================================
     渲染
     ============================================================ */
  return (
    <div className="ur-page">
      {/* 顶部导航栏 */}
      <header className="ur-top-nav">
        <button className="ur-back-btn" onClick={handleCancel} aria-label="返回">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 className="ur-nav-title">
          {phase() === 'idle'       && '上传路线'}
          {phase() === 'gap_filling' && '补充信息'}
          {phase() === 'preview'    && '确认上传'}
          {phase() === 'done'       && '上传完成'}
        </h1>
        <div style={{ width: 40 }} />
      </header>

      {/* 内容区 */}
      <main className="ur-main">
        {phase() === 'idle' && (
          <RouteUploader
            onGapStart={handleGapStart}
            onUploaded={handleUploadComplete}
            onCancel={handleCancel}
          />
        )}

        {phase() === 'gap_filling' && (
          <GapFillingChat
            sessionId={sessionId()}
            gaps={gaps()}
            onComplete={handleGapComplete}
            onCancel={handleCancel}
          />
        )}

        {phase() === 'preview' && parsedRoute() && (
          <RoutePreview
            sessionId={sessionId()}
            route={parsedRoute()!}
            onConfirm={handleConfirm}
            onContinueEditing={handleContinueEditing}
            onCancel={handleCancel}
          />
        )}

        {phase() === 'done' && (
          <div className="ur-done">
            <div className="ur-done-icon" aria-hidden="true">
              <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                <circle cx="40" cy="40" r="40" fill="var(--clr-primary-light, #f5ebe9)"/>
                <circle cx="40" cy="40" r="28" fill="var(--clr-primary, #b22314)" fillOpacity="0.12"/>
                <path d="M26 40L35 49L54 30" stroke="var(--clr-primary, #b22314)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="ur-done-title">提交成功！</h2>
            <p className="ur-done-desc">
              您的路线已提交审核，审核通过后将自动入库并向用户可见。
            </p>
            <button className="ur-done-cta" onClick={() => window.location.href = 'index.html'}>
              返回首页
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default UploadRoutePage;
