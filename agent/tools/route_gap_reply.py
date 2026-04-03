"""
WeGO · route_gap_reply.py
后台「Agent 交流」补全：根据用户多轮回复更新 route_drafts，不写入正式 routes 表。
"""
from __future__ import annotations

import copy
import json
import os
from typing import Any, Optional

import requests

from .route_merge import apply_overrides_to_parsed, collect_gaps_for_route, gaps_to_json

_SUPABASE_URL = os.getenv('SUPABASE_URL', '')
_SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '') or os.getenv(
    'SUPABASE_SERVICE_KEY', ''
) or os.getenv('SUPABASE_ANON_KEY', '')


def _headers() -> dict:
    return {'apikey': _SUPABASE_KEY, 'Authorization': f'Bearer {_SUPABASE_KEY}'}


def _get_draft(session_id: str) -> Optional[dict]:
    if not _SUPABASE_URL or not _SUPABASE_KEY:
        return None
    try:
        r = requests.get(
            f'{_SUPABASE_URL}/rest/v1/route_drafts',
            headers=_headers(),
            params={'session_id': f'eq.{session_id}', 'select': '*'},
            timeout=10,
        )
        if r.ok:
            rows = r.json()
            return rows[0] if rows else None
    except Exception:
        pass
    return None


def _patch_draft(session_id: str, body: dict) -> bool:
    try:
        r = requests.patch(
            f'{_SUPABASE_URL}/rest/v1/route_drafts',
            headers={**_headers(), 'Content-Type': 'application/json'},
            params={'session_id': f'eq.{session_id}'},
            json=body,
            timeout=10,
        )
        return r.ok
    except Exception:
        return False


def process_gap_reply(session_id: str, overrides: list[dict]) -> dict[str, Any]:
    """
    使用完整 overrides 列表（含本轮及历史）合并到草稿的 parsed_data，刷新 gap_items。
    """
    draft = _get_draft(session_id)
    if not draft:
        return {'status': 'error', 'error': f'未找到草稿 session_id={session_id}'}

    base = draft.get('parsed_data') or {}
    parsed = copy.deepcopy(base)
    merged_list = [o for o in (overrides or []) if o.get('field') is not None]

    parsed = apply_overrides_to_parsed(parsed, merged_list)
    route_preview, gaps = collect_gaps_for_route(parsed)

    gap_json = gaps_to_json(gaps)
    subjective_left = [g for g in gap_json if g.get('gap_type') == 'subjective']
    new_status = 'ready_to_confirm' if not subjective_left else 'gaps_filling'

    ok = _patch_draft(
        session_id,
        {
            'parsed_data': route_preview,
            'gap_items': gap_json,
            'user_overrides': merged_list,
            'status': new_status,
        },
    )
    if not ok:
        return {'status': 'error', 'error': '更新草稿失败（Supabase）'}

    ack = '已记录你的补充。'
    if merged_list:
        last = merged_list[-1]
        ack = f'已记录字段「{last.get("field", "")}」的回复。'
    if not subjective_left:
        ack += ' 必填信息已齐，请在管理端预览并确认入库。'

    out_status = 'has_gaps' if subjective_left else 'success'
    return {
        'status': out_status,
        'session_id': session_id,
        'assistant_message': ack,
        'gaps': gap_json,
        'route_preview': route_preview,
        'user_overrides': merged_list,
    }


def gap_reply_tool_json(session_id: str, overrides_json: str) -> str:
    """供 LangChain tool 包装的字符串接口。"""
    try:
        ov = json.loads(overrides_json) if overrides_json else []
    except json.JSONDecodeError:
        ov = []
    return json.dumps(process_gap_reply(session_id, ov), ensure_ascii=False)
