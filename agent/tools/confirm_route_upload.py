"""
WeGO · confirm_route_upload.py
Sprint 11.3.3

确认路线上传：
  接收用户对主观 Gap 的最终回答（overrides），
  合并 auto_queried 数据，生成最终路线 JSON，
  执行 routes + spots 表 upsert，
  写入 ingestion_job 审计记录。

CLI 示例：
    python -m tools.confirm_route_upload --session-id <uuid> --overrides '[{"field":"title","value":"我的路线"}]'
"""
import copy
import json
import os
import uuid
from typing import Optional
import requests
from pydantic import BaseModel, Field
from langchain_core.tools import tool

from .route_merge import apply_overrides_to_parsed


# ──────────────────────────────────────────────────────────
# Schema
# ──────────────────────────────────────────────────────────
class ConfirmRouteUploadInput(BaseModel):
    session_id: str
    confirmed: bool = Field(description="用户是否确认写入")
    overrides: list[dict] = Field(
        default_factory=list,
        description='主观 Gap 回答数组 [{"field": "...", "value": "..."}]',
    )


# ──────────────────────────────────────────────────────────
# Supabase 写入
# ──────────────────────────────────────────────────────────
_SUPABASE_URL = os.getenv('SUPABASE_URL', '')
_SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY', os.getenv('SUPABASE_ANON_KEY', ''))


def _get_draft(session_id: str) -> Optional[dict]:
    """从 route_drafts 读取草稿。"""
    if not _SUPABASE_URL:
        return None
    headers = {'apikey': _SUPABASE_KEY, 'Authorization': f'Bearer {_SUPABASE_KEY}'}
    try:
        resp = requests.get(
            f'{_SUPABASE_URL}/rest/v1/route_drafts',
            headers=headers,
            params={'session_id': f'eq.{session_id}', 'select': '*'},
            timeout=5,
        )
        if resp.ok:
            rows = resp.json()
            return rows[0] if rows else None
    except Exception:
        pass
    return None


def _upsert_routes_and_spots(route_data: dict, ingestion_job_id: str = None) -> dict:
    """
    将路线数据写入 routes + spots 表（upsert）。
    返回写入报告 { route_id, spot_ids, errors }。
    """
    if not _SUPABASE_URL:
        return {'route_id': None, 'spot_ids': [], 'errors': ['SUPABASE_URL 未配置']}

    headers = {
        'apikey': _SUPABASE_KEY,
        'Authorization': f'Bearer {_SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }

    route_id = None
    spot_ids = []
    errors = []

    # 1. Upsert routes
    route_payload = {
        'title': route_data.get('route_name') or route_data.get('title', '未命名'),
        'description': route_data.get('description', ''),
        'duration_minutes': route_data.get('duration_minutes'),
        'tags': route_data.get('tags', []) or [],
        'cover_image': route_data.get('cover_image'),
        'total_distance_km': route_data.get('total_distance_km'),
        'is_visible': route_data.get('is_visible', True),
        'updated_at': 'now()',
    }
    if route_data.get('heat_level') is not None:
        route_payload['heat_level'] = route_data['heat_level']
    if route_data.get('id'):
        route_payload['id'] = route_data['id']

    try:
        resp = requests.post(
            f'{_SUPABASE_URL}/rest/v1/routes',
            headers={**headers, 'Prefer': 'return=representation'},
            json=route_payload,
            timeout=5,
        )
        if resp.ok:
            created = resp.json()
            route_id = (created[0] if isinstance(created, list) else created).get('id')
        else:
            errors.append(f'routes upsert 失败: {resp.status_code} {resp.text}')
    except Exception as e:
        errors.append(f'routes upsert 异常: {e}')

    # 2. Upsert spots（按 sort_order）
    spots = route_data.get('spots', [])
    for idx, spot in enumerate(spots):
        if not spot.get('name'):
            continue
        spot_payload = {
            'route_id': route_id,
            'name': spot.get('name', ''),
            'subtitle': spot.get('subtitle', ''),
            'short_desc': spot.get('short_desc', ''),
            'detail': spot.get('detail', ''),
            'rich_content': spot.get('rich_content') or spot.get('detail', ''),
            'tags': spot.get('tags', []),
            'thumb': spot.get('thumb', ''),
            'photos': spot.get('photos', []),
            'lat': spot.get('lat'),
            'lng': spot.get('lng'),
            'geofence_radius_m': spot.get('geofence_radius_m', 30),
            'estimated_stay_min': spot.get('estimated_stay_min'),
            'sort_order': spot.get('sort_order', idx),
            'is_visible': spot.get('is_visible', True),
            'is_easter_egg': spot.get('is_easter_egg', False),
            'spot_type': spot.get('spot_type', 'attraction'),
        }
        if spot.get('id'):
            spot_payload['id'] = spot['id']
        try:
            resp = requests.post(
                f'{_SUPABASE_URL}/rest/v1/spots',
                headers={**headers, 'Prefer': 'return=representation'},
                json=spot_payload,
                timeout=5,
            )
            if resp.ok:
                created = resp.json()
                sid = (created[0] if isinstance(created, list) else created).get('id')
                if sid:
                    spot_ids.append(sid)
            else:
                errors.append(f'spot[{idx}] upsert 失败: {resp.status_code}')
        except Exception as e:
            errors.append(f'spot[{idx}] upsert 异常: {e}')

    return {'route_id': route_id, 'spot_ids': spot_ids, 'errors': errors}


# ──────────────────────────────────────────────────────────
# 工具入口
# ──────────────────────────────────────────────────────────
@tool
def confirm_route_upload(session_id: str, confirmed: bool, overrides: list[dict] = None) -> str:
    """
    Confirm a route upload session after the user has reviewed and filled in Gap fields.

    Args:
        session_id: The unique session ID from the upload flow.
        confirmed: Whether the user has confirmed the upload (true = write to DB).
        overrides: Array of {field, value} for subjective Gap answers.
                   Example: [{"field": "0:name", "value": "我的景点"}]

    Returns:
        JSON string:
        {
          "session_id": "...",
          "status": "confirmed" | "skipped",
          "route_preview": { ... },   // 最终路线预览（应用 overrides 后）
          "import_report": { "route_id": "...", "spot_ids": [...] },
          "error": "..."
        }
    """
    overrides = overrides or []

    try:
        draft = _get_draft(session_id)
        if not draft:
            return json.dumps({
                'session_id': session_id,
                'status': 'error',
                'error': f'未找到草稿 session_id={session_id}',
            }, ensure_ascii=False)

        stored = draft.get('user_overrides') or []
        omap = {o['field']: o['value'] for o in stored if o.get('field') is not None}
        for o in overrides:
            if o.get('field') is not None:
                omap[o['field']] = o['value']
        combined = [{'field': k, 'value': v} for k, v in omap.items()]

        parsed = copy.deepcopy(draft.get('parsed_data') or {})
        merged = apply_overrides_to_parsed(parsed, combined)

        final_route = {
            'route_name': merged.get('route_name', '未命名路线'),
            'description': merged.get('description', ''),
            'cover_image': merged.get('cover_image'),
            'tags': merged.get('tags', []),
            'duration_minutes': merged.get('duration_minutes'),
            'total_distance_km': merged.get('total_distance_km'),
            'heat_level': merged.get('heat_level'),
            'is_visible': merged.get('is_visible', True),
            'spots': merged.get('spots', []),
        }

        if not confirmed:
            return json.dumps({
                'session_id': session_id,
                'status': 'skipped',
                'route_preview': final_route,
            }, ensure_ascii=False)

        # 执行写入
        import_report = _upsert_routes_and_spots(final_route)

        # 更新草稿状态
        if _SUPABASE_URL:
            headers = {'apikey': _SUPABASE_KEY, 'Authorization': f'Bearer {_SUPABASE_KEY}'}
            requests.patch(
                f'{_SUPABASE_URL}/rest/v1/route_drafts',
                headers=headers,
                json={
                    'status': 'confirmed',
                    'confirmed_data': final_route,
                    'confirmed_at': 'now()',
                },
                params={'session_id': f'eq.{session_id}'},
                timeout=5,
            )

        return json.dumps({
            'session_id': session_id,
            'status': 'confirmed',
            'route_preview': final_route,
            'import_report': import_report,
        }, ensure_ascii=False)

    except Exception as e:
        return json.dumps({
            'session_id': session_id,
            'status': 'error',
            'error': str(e),
        }, ensure_ascii=False)


if __name__ == '__main__':
    import sys
    sid = str(uuid.uuid4())
    if len(sys.argv) > 1:
        sid = sys.argv[1]
    print(confirm_route_upload.invoke({
        'session_id': sid,
        'confirmed': False,
        'overrides': [],
    }))
