"""
WeGO · route_merge.py
从解析后的路线预览生成 Gap 列表、应用用户 overrides（供 upload / gap-reply / confirm 共用）。
"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class GapItem(BaseModel):
    field: str
    gap_type: str = Field(description="'objective' 或 'subjective'")
    message: str
    auto_queried: bool = False
    suggested_value: Optional[str] = None


def _safe_float(v) -> Optional[float]:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _safe_int(v) -> Optional[int]:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def parse_override_value(key: str, value: str) -> Any:
    """将 overrides 中的字符串转为字段类型（与 confirm_route_upload 对齐）。"""
    if key.endswith(':lat'):
        return _safe_float(value)
    if key.endswith(':lng'):
        return _safe_float(value)
    if key.endswith(':estimated_stay_min'):
        return _safe_int(value)
    if key.endswith(':tags'):
        return [t.strip() for t in value.replace(',', '、').split('、') if t.strip()]
    return value


def apply_overrides_to_parsed(parsed: dict, overrides: list[dict]) -> dict:
    """
    就地合并 overrides 到 parsed_data（route_name + spots）。
    overrides: [{"field": "title"|"0:lat"|..., "value": "..."}]
    """
    if not parsed:
        return parsed
    override_map = {o['field']: o['value'] for o in overrides if o.get('field')}
    route_name = parsed.get('route_name', '未命名路线')
    if 'title' in override_map:
        route_name = override_map['title']

    spots = list(parsed.get('spots') or [])
    for idx, spot in enumerate(spots):
        if not isinstance(spot, dict):
            continue
        for key in ('name', 'lat', 'lng', 'estimated_stay_min', 'tags', 'subtitle', 'short_desc', 'detail'):
            fk = f'{idx}:{key}'
            if fk in override_map:
                spot[key] = parse_override_value(fk, str(override_map[fk]))

    out = {**parsed, 'route_name': route_name, 'spots': spots}
    return out


def collect_gaps_for_route(route_preview: dict, try_auto: bool = True) -> tuple[dict, list[GapItem]]:
    """
    对已有 route_preview 重新计算 Gap，并返回更新后的预览（如自动补全坐标）。
    """
    # 延迟导入，避免 confirm_route_upload ↔ upload_route 循环依赖
    if try_auto:
        from .auto_query import auto_query_coordinates, infer_tags_from_spot, infer_stay_duration
    else:
        auto_query_coordinates = infer_tags_from_spot = infer_stay_duration = None  # type: ignore

    gaps: list[GapItem] = []
    route_name = route_preview.get('route_name') or route_preview.get('title') or ''
    spots_raw = route_preview.get('spots') or []

    if not str(route_name).strip():
        gaps.append(
            GapItem(field='title', gap_type='subjective', message='请为这条路线起一个标题')
        )

    parsed_spots: list[dict] = []
    for idx, s in enumerate(spots_raw):
        if not isinstance(s, dict):
            continue
        name = (s.get('name') or '').strip() if isinstance(s.get('name'), str) else ''
        lat = _safe_float(s.get('lat'))
        lng = _safe_float(s.get('lng'))
        sort_order = _safe_int(s.get('sort_order', idx))
        if sort_order is None:
            sort_order = idx

        if not name:
            gaps.append(
                GapItem(
                    field=f'{idx}:name',
                    gap_type='subjective',
                    message='请提供该景点的名称',
                )
            )

        estay = s.get('estimated_stay_min')
        tags = list(s.get('tags') or []) if s.get('tags') else []

        if lat is None or lng is None:
            if name and try_auto:
                coords = auto_query_coordinates(name)
                if coords:
                    lat, lng = coords['lat'], coords['lng']
                    gaps.append(
                        GapItem(
                            field=f'{idx}:lat',
                            gap_type='objective',
                            message=f'已通过高德 API 自动查询到「{name}」的坐标',
                            auto_queried=True,
                            suggested_value=f"lat={lat}, lng={lng}",
                        )
                    )
                else:
                    gaps.append(
                        GapItem(
                            field=f'{idx}:lat',
                            gap_type='subjective',
                            message=f'请提供「{name}」的经纬度坐标（可通过地图查询）',
                        )
                    )
            elif not name:
                gaps.append(
                    GapItem(
                        field=f'{idx}:lat',
                        gap_type='subjective',
                        message='请提供该景点的经纬度坐标',
                    )
                )
            else:
                gaps.append(
                    GapItem(
                        field=f'{idx}:lat',
                        gap_type='subjective',
                        message=f'请提供「{name}」的经纬度坐标',
                    )
                )

        if estay is None:
            if name and try_auto:
                suggested = infer_stay_duration(name)
                if suggested:
                    gaps.append(
                        GapItem(
                            field=f'{idx}:estimated_stay_min',
                            gap_type='objective',
                            message='已根据景点类型自动推断建议停留时长',
                            auto_queried=True,
                            suggested_value=f'{suggested} 分钟',
                        )
                    )
                else:
                    gaps.append(
                        GapItem(
                            field=f'{idx}:estimated_stay_min',
                            gap_type='subjective',
                            message=f'「{name}」建议停留多长时间？',
                        )
                    )
            elif not name:
                gaps.append(
                    GapItem(
                        field=f'{idx}:estimated_stay_min',
                        gap_type='subjective',
                        message='该景点建议停留多长时间？',
                    )
                )
            else:
                gaps.append(
                    GapItem(
                        field=f'{idx}:estimated_stay_min',
                        gap_type='subjective',
                        message=f'「{name}」建议停留多长时间？',
                    )
                )

        if not tags and try_auto and name:
            inferred = infer_tags_from_spot(name)
            if inferred:
                gaps.append(
                    GapItem(
                        field=f'{idx}:tags',
                        gap_type='objective',
                        message='已根据景点名称自动推断标签',
                        auto_queried=True,
                        suggested_value='、'.join(inferred),
                    )
                )

        parsed_spots.append({
            **s,
            'name': name,
            'lat': lat,
            'lng': lng,
            'estimated_stay_min': estay,
            'tags': tags,
            'sort_order': sort_order,
        })

    merged = {
        **route_preview,
        'route_name': str(route_name).strip() or route_preview.get('route_name') or '未命名路线',
        'spots': parsed_spots,
    }
    return merged, gaps


def gaps_to_json(gaps: list[GapItem]) -> list[dict]:
    return [g.model_dump(exclude_none=True) for g in gaps]
