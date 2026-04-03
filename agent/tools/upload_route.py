"""
WeGO · upload_route.py
Sprint 11.3.1

解析用户上传的路线文件（JSON / Markdown / TXT / URL），
识别缺失字段（Gap），返回路线预览和 Gap 列表。

CLI 示例：
    python -m tools.upload_route --file content.json --session-id <uuid>
"""
import json
import re
import uuid
from typing import Optional
from pydantic import BaseModel, Field
from langchain_core.tools import tool

# 自身工具
from .auto_query import auto_query_coordinates, infer_tags_from_spot, infer_stay_duration


# ──────────────────────────────────────────────────────────
# Input / Output Schema
# ──────────────────────────────────────────────────────────
class UploadRouteInput(BaseModel):
    file_content: str = Field(description="原始文件内容（JSON 文本 / Markdown / TXT / URL）")
    file_type: str = Field(description="文件类型: json | markdown | txt | url")
    session_id: str = Field(description="会话唯一 ID")


class GapItem(BaseModel):
    field: str
    gap_type: str = Field(description="'objective' 或 'subjective'")
    message: str
    auto_queried: bool = False
    suggested_value: Optional[str] = None


class SpotData(BaseModel):
    name: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    estimated_stay_min: Optional[int] = None
    sort_order: Optional[int] = None
    subtitle: Optional[str] = None
    short_desc: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    thumb: Optional[str] = None


class UploadRouteOutput(BaseModel):
    session_id: str
    status: str = Field(description="'success' | 'has_gaps' | 'error'")
    route_preview: Optional[dict] = None
    gaps: list[GapItem] = Field(default_factory=list)
    error: Optional[str] = None


# ──────────────────────────────────────────────────────────
# 解析器
# ──────────────────────────────────────────────────────────
def parse_json(content: str) -> tuple[dict, list[GapItem]]:
    """解析 JSON 路线，检测缺失字段（Gap）。"""
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"JSON 解析失败: {e}")

    # 支持 { route: {...}, spots: [...] } 或直接 { spots: [...] }
    route_data = data if 'spots' in data or 'title' in data else data.get('route', {})
    spots_raw = route_data.get('spots', data.get('spots', []))

    parsed_spots: list[dict] = []
    gaps: list[GapItem] = []

    for idx, s in enumerate(spots_raw):
        if not isinstance(s, dict):
            continue

        name = s.get('name', '').strip() if isinstance(s, dict) else ''
        lat  = _safe_float(s.get('lat'))
        lng  = _safe_float(s.get('lng'))
        sort_order = _safe_int(s.get('sort_order', idx))

        spot_gaps: list[GapItem] = []

        # 景点名称
        if not name:
            spot_gaps.append(GapItem(
                field=f"{idx}:name",
                gap_type="subjective",
                message="请提供该景点的名称",
            ))

        # 坐标：尝试自动查询
        if lat is None or lng is None:
            if name:
                coords = auto_query_coordinates(name)
                if coords:
                    lat, lng = coords['lat'], coords['lng']
                    spot_gaps.append(GapItem(
                        field=f"{idx}:lat",
                        gap_type="objective",
                        message=f"已通过高德 API 自动查询到「{name}」的坐标",
                        auto_queried=True,
                        suggested_value=f"lat={lat}, lng={lng}",
                    ))
                else:
                    spot_gaps.append(GapItem(
                        field=f"{idx}:lat",
                        gap_type="subjective",
                        message=f"请提供「{name}」的经纬度坐标（可通过高德地图查询）",
                    ))
            else:
                spot_gaps.append(GapItem(
                    field=f"{idx}:lat",
                    gap_type="subjective",
                    message="请提供该景点的经纬度坐标",
                ))

        # 停留时长：尝试自动推断
        if s.get('estimated_stay_min') is None:
            if name:
                suggested = infer_stay_duration(name)
                if suggested:
                    spot_gaps.append(GapItem(
                        field=f"{idx}:estimated_stay_min",
                        gap_type="objective",
                        message=f"已根据景点类型自动推断建议停留时长",
                        auto_queried=True,
                        suggested_value=f"{suggested} 分钟",
                    ))
                else:
                    spot_gaps.append(GapItem(
                        field=f"{idx}:estimated_stay_min",
                        gap_type="subjective",
                        message=f"「{name}」建议停留多长时间？",
                    ))
            else:
                spot_gaps.append(GapItem(
                    field=f"{idx}:estimated_stay_min",
                    gap_type="subjective",
                    message="该景点建议停留多长时间？",
                ))

        # 标签：尝试自动推断
        if not s.get('tags'):
            if name:
                tags = infer_tags_from_spot(name)
                if tags:
                    spot_gaps.append(GapItem(
                        field=f"{idx}:tags",
                        gap_type="objective",
                        message="已根据景点名称自动推断标签",
                        auto_queried=True,
                        suggested_value="、".join(tags),
                    ))

        parsed_spots.append({
            'name': name or '',
            'lat': lat,
            'lng': lng,
            'estimated_stay_min': s.get('estimated_stay_min'),
            'sort_order': sort_order,
            'subtitle': s.get('subtitle', ''),
            'short_desc': s.get('short_desc', ''),
            'tags': s.get('tags', []),
            'thumb': s.get('thumb', ''),
        })
        gaps.extend(spot_gaps)

    # 路线名称
    if not route_data.get('title'):
        gaps.insert(0, GapItem(
            field="title",
            gap_type="subjective",
            message="请为这条路线起一个标题",
        ))

    return {
        'route_name': route_data.get('title', '未命名路线'),
        'spots': parsed_spots,
    }, gaps


def parse_markdown(content: str) -> tuple[dict, list[GapItem]]:
    """解析 Markdown 格式的路线介绍，提取景点信息。"""
    gaps: list[GapItem] = []
    spots: list[dict] = []

    # 按 ## 景点 或 ## 地点 拆分
    sections = re.split(r'\n(?=##\s)', content.strip())

    for idx, section in enumerate(sections):
        lines = section.strip().split('\n')
        if not lines:
            continue

        title_match = re.match(r'^##\s+(.+)$', lines[0])
        if title_match:
            name = title_match.group(1).strip()
        else:
            # 没有 ## 标题时，用第一行作为景点名
            name = lines[0].strip()
            lines = lines[1:]

        if not name or len(name) < 2:
            continue

        body = '\n'.join(lines)

        # 尝试从内容中提取 lat / lng
        lat, lng = _extract_coords(body)
        tags = _extract_tags(body)
        stay = _extract_stay(body)

        spot_gaps: list[GapItem] = []
        if lat is None or lng is None:
            coords = auto_query_coordinates(name)
            if coords:
                lat, lng = coords['lat'], coords['lng']
                spot_gaps.append(GapItem(
                    field=f"{idx}:lat", gap_type="objective",
                    message=f"已自动查询「{name}」坐标",
                    auto_queried=True,
                    suggested_value=f"lat={lat}, lng={lng}",
                ))
            else:
                spot_gaps.append(GapItem(
                    field=f"{idx}:lat", gap_type="subjective",
                    message=f"请提供「{name}」的经纬度坐标",
                ))

        if stay is None:
            inferred = infer_stay_duration(name)
            if inferred:
                spot_gaps.append(GapItem(
                    field=f"{idx}:estimated_stay_min", gap_type="objective",
                    message="已推断停留时长", auto_queried=True,
                    suggested_value=f"{inferred} 分钟",
                ))
            else:
                spot_gaps.append(GapItem(
                    field=f"{idx}:estimated_stay_min", gap_type="subjective",
                    message=f"「{name}」建议停留多长时间？",
                ))

        spots.append({
            'name': name,
            'lat': lat,
            'lng': lng,
            'estimated_stay_min': stay,
            'sort_order': idx,
            'tags': tags,
        })
        gaps.extend(spot_gaps)

    return {
        'route_name': _extract_title_md(content) or '未命名路线',
        'spots': spots,
    }, gaps


def parse_txt(content: str) -> tuple[dict, list[GapItem]]:
    """解析纯文本格式，每行一个景点名。"""
    gaps: list[GapItem] = []
    spots: list[dict] = []

    for idx, line in enumerate(content.strip().split('\n')):
        name = line.strip().strip('・-–—*#0123456789.）').strip()
        if not name or len(name) < 2:
            continue

        coords = auto_query_coordinates(name)
        lat = lng = None
        if coords:
            lat, lng = coords['lat'], coords['lng']
            gaps.append(GapItem(
                field=f"{idx}:lat", gap_type="objective",
                message=f"已自动查询「{name}」坐标",
                auto_queried=True,
                suggested_value=f"lat={lat}, lng={lng}",
            ))
        else:
            gaps.append(GapItem(
                field=f"{idx}:lat", gap_type="subjective",
                message=f"请提供「{name}」的经纬度坐标",
            ))

        gaps.append(GapItem(
            field=f"{idx}:estimated_stay_min", gap_type="subjective",
            message=f"「{name}」建议停留多长时间？",
        ))

        spots.append({
            'name': name,
            'lat': lat,
            'lng': lng,
            'sort_order': idx,
        })

    return {'route_name': '未命名路线', 'spots': spots}, gaps


# ──────────────────────────────────────────────────────────
# 工具入口
# ──────────────────────────────────────────────────────────
@tool
def upload_route(file_content: str, file_type: str, session_id: str) -> str:
    """
    Parse a user-uploaded route file (JSON / Markdown / TXT / URL).
    Detects missing required fields (Gaps) and attempts auto-query for coordinates.

    Args:
        file_content: Raw file content (JSON string, Markdown, plain text, or URL).
        file_type: One of: 'json', 'markdown', 'txt', 'url'.
        session_id: Unique session ID for this upload flow.

    Returns:
        JSON string of UploadRouteOutput:
        {
          "session_id": "...",
          "status": "success" | "has_gaps" | "error",
          "route_preview": { "route_name": "...", "spots": [...] },
          "gaps": [{ "field": "...", "gap_type": "...", "message": "..." }, ...],
          "error": "..."
        }
    """
    if not session_id:
        session_id = str(uuid.uuid4())

    try:
        if file_type == 'json':
            route_data, gaps = parse_json(file_content)
        elif file_type == 'markdown':
            route_data, gaps = parse_markdown(file_content)
        elif file_type == 'txt':
            route_data, gaps = parse_txt(file_content)
        elif file_type == 'url':
            # 由调用方（或 auto_query.fetch_url_content）预抓取内容，
            # 此处将 URL 当作 txt 模式解析（由外部传入抓取后的内容）
            route_data, gaps = parse_txt(file_content)
        else:
            return json.dumps(UploadRouteOutput(
                session_id=session_id,
                status='error',
                error=f"不支持的文件类型: {file_type}",
            ).model_dump(exclude_none=True), ensure_ascii=False)

        output = UploadRouteOutput(
            session_id=session_id,
            status='has_gaps' if gaps else 'success',
            route_preview=route_data,
            gaps=[g.model_dump() for g in gaps],
        )
        return json.dumps(output.model_dump(exclude_none=True), ensure_ascii=False)

    except Exception as e:
        return json.dumps(UploadRouteOutput(
            session_id=session_id,
            status='error',
            error=str(e),
        ).model_dump(exclude_none=True), ensure_ascii=False)


# ──────────────────────────────────────────────────────────
# 辅助函数
# ──────────────────────────────────────────────────────────
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


_COORD_RE = re.compile(
    r'(?:lat|latitude)[＝:=]\s*([-\d.]+)[^\d]*?(?:lng|lon|longitude)[＝:=]\s*([-\d.]+)',
    re.IGNORECASE,
)
_TAG_RE = re.compile(r'#([^\s#]+)')
_STAY_RE = re.compile(r'(\d+)\s*(?:分钟|min|分钟|hour|小时|h)')


def _extract_coords(text: str):
    m = _COORD_RE.search(text)
    if m:
        return _safe_float(m.group(1)), _safe_float(m.group(2))
    return None, None


def _extract_tags(text: str):
    return _TAG_RE.findall(text)


def _extract_stay(text: str) -> Optional[int]:
    m = _STAY_RE.search(text)
    if m:
        val = int(m.group(1))
        if 'hour' in text.lower() or '小时' in text or 'h)' in text.lower():
            val *= 60
        return val
    return None


def _extract_title_md(content: str) -> Optional[str]:
    m = re.search(r'^#\s+(.+)$', content.strip(), re.MULTILINE)
    return m.group(1).strip() if m else None


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        with open(sys.argv[1]) as f:
            content = f.read()
        ext = sys.argv[1].rsplit('.', 1)[-1].lower()
        ft = {'json': 'json', 'md': 'markdown', 'txt': 'txt'}.get(ext, 'txt')
    else:
        content = '{"title":"测试路线","spots":[{"name":"前门大街","lat":39.8973,"lng":116.3976}]}'
        ft = 'json'
    print(upload_route.invoke({'file_content': content, 'file_type': ft, 'session_id': str(uuid.uuid4())}))
