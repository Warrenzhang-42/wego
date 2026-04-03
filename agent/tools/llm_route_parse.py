"""
WeGO · llm_route_parse.py
使用 LLM 将 YAML/Markdown/混排文本解析为路线结构化数据（与 upload_route 内部格式对齐）。
"""
from __future__ import annotations

import os
import re
from typing import Any, Optional

from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field


class _LlmSpot(BaseModel):
    id: Optional[str] = None
    name: str = ''
    subtitle: Optional[str] = None
    short_desc: Optional[str] = None
    detail: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    geofence_radius_m: Optional[int] = None
    estimated_stay_min: Optional[int] = None
    tags: list[str] = Field(default_factory=list)
    thumb: Optional[str] = None
    photos: list[str] = Field(default_factory=list)
    sort_order: Optional[int] = None


class _LlmRoute(BaseModel):
    title: str = ''
    description: Optional[str] = None
    cover_image: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    duration_minutes: Optional[int] = None
    total_distance_km: Optional[float] = None
    heat_level: Optional[int] = None
    spots: list[_LlmSpot] = Field(default_factory=list)


_YAMLISH = re.compile(
    r"(?m)^\s*(?:id|title|spots|description|cover_image)\s*:",
)


def looks_like_yaml_route(text: str) -> bool:
    t = (text or '').strip()
    if len(t) < 80:
        return False
    hits = len(_YAMLISH.findall(t))
    return hits >= 2 and 'spots' in t


def _build_llm() -> Optional[ChatOpenAI]:
    key = os.getenv('OPENAI_API_KEY')
    if not key:
        return None
    return ChatOpenAI(
        api_key=key,
        base_url=os.getenv('OPENAI_API_BASE', 'https://api.openai.com/v1'),
        model=os.getenv('OPENAI_API_MODEL', 'gpt-4o-mini'),
        temperature=0.2,
    )


def parse_route_document_with_llm(raw: str) -> dict[str, Any]:
    """
    返回与 upload_route 一致的 route_preview 字典；失败时抛异常。
    """
    llm = _build_llm()
    if not llm:
        raise RuntimeError('未配置 OPENAI_API_KEY，无法使用 LLM 解析该格式')

    structured = llm.with_structured_output(_LlmRoute)
    prompt = (
        '你是 WeGO 路线数据提取器。用户粘贴的是一条城市游览路线，可能是 YAML、Markdown 与说明混排。'
        '请只依据原文提取结构化信息，不要编造景点坐标；原文没有的 lat/lng 保持为空。'
        'spots 顺序与原文一致。duration_minutes 对应 estimated_duration_min 或类似字段。'
        'total_distance_km 对应 distance_km。heat_level 为整数 0-5 若原文有。\n\n---\n'
        f'{raw[:120000]}'
    )
    out: _LlmRoute = structured.invoke(prompt)

    spots: list[dict] = []
    for i, sp in enumerate(out.spots):
        spots.append({
            'name': (sp.name or '').strip(),
            'lat': sp.lat,
            'lng': sp.lng,
            'estimated_stay_min': sp.estimated_stay_min,
            'sort_order': sp.sort_order if sp.sort_order is not None else i,
            'subtitle': sp.subtitle or '',
            'short_desc': sp.short_desc or '',
            'detail': sp.detail or '',
            'tags': sp.tags or [],
            'thumb': sp.thumb or '',
            'photos': list(sp.photos or []),
            'geofence_radius_m': sp.geofence_radius_m,
        })

    return {
        'route_name': (out.title or '未命名路线').strip() or '未命名路线',
        'description': out.description or '',
        'cover_image': out.cover_image,
        'tags': out.tags or [],
        'duration_minutes': out.duration_minutes,
        'total_distance_km': out.total_distance_km,
        'heat_level': out.heat_level,
        'spots': spots,
    }


def try_llm_parse_json(raw: str) -> Optional[dict]:
    """供测试：返回 dict 或 None。"""
    try:
        return parse_route_document_with_llm(raw)
    except Exception:
        return None
