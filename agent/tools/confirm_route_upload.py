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
# Backend API 写入
# ──────────────────────────────────────────────────────────
_BACKEND_API_URL = os.getenv('BACKEND_API_URL', 'http://127.0.0.1:8787')
_INTERNAL_API_TOKEN = os.getenv('INTERNAL_API_TOKEN', '')


def _get_draft(session_id: str) -> Optional[dict]:
    """从 backend route_drafts 读取草稿。"""
    if not _BACKEND_API_URL:
        return None
    headers = {'x-internal-token': _INTERNAL_API_TOKEN}
    try:
        resp = requests.get(
            f'{_BACKEND_API_URL}/api/internal/route-drafts/{session_id}',
            headers=headers,
            timeout=5,
        )
        if resp.ok:
            return resp.json()
    except Exception:
        pass
    return None


def _upsert_routes_and_spots(route_data: dict, ingestion_job_id: str = None) -> dict:
    """
    将路线数据写入 routes + spots 表（upsert）。
    返回写入报告 { route_id, spot_ids, errors }。
    """
    if not _BACKEND_API_URL:
        return {'route_id': None, 'spot_ids': [], 'errors': ['BACKEND_API_URL 未配置']}
    headers = {'x-internal-token': _INTERNAL_API_TOKEN, 'Content-Type': 'application/json'}
    try:
        resp = requests.post(
            f'{_BACKEND_API_URL}/api/internal/routes/import',
            headers=headers,
            json=route_data,
            timeout=5,
        )
        if resp.ok:
            return resp.json()
        return {'route_id': None, 'spot_ids': [], 'errors': [f'route import 失败: {resp.status_code} {resp.text}']}
    except Exception as e:
        return {'route_id': None, 'spot_ids': [], 'errors': [f'route import 异常: {e}']}


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
        if _BACKEND_API_URL:
            headers = {'x-internal-token': _INTERNAL_API_TOKEN, 'Content-Type': 'application/json'}
            requests.patch(
                f'{_BACKEND_API_URL}/api/internal/route-drafts/{session_id}',
                headers=headers,
                json={
                    'status': 'confirmed',
                    'confirmed_data': final_route,
                    'confirmed_at': __import__('datetime').datetime.utcnow().isoformat(),
                },
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
