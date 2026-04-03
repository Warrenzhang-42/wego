"""
WeGO · auto_query.py
Sprint 11.3.2

辅助函数：自动查询缺失数据
  - auto_query_coordinates(spot_name)  → 高德 Geocoding API 查询 WGS-84 坐标
  - infer_tags_from_spot(spot_name)     → 根据景点名推断标签
  - infer_stay_duration(spot_name)     → 根据景点类型推断停留时长
  - fetch_url_content(url)              → 抓取网页正文（用于 URL 模式）
"""
import os
import re
import json
from typing import Optional
import requests
from langchain_core.tools import tool

# ──────────────────────────────────────────────────────────
# 高德 Geocoding
# ──────────────────────────────────────────────────────────
_AMAP_KEY = os.getenv('AMAP_API_KEY', os.getenv('GAODE_API_KEY', ''))

# 高德 Geocoding API（WGS-84 直接返回，无需转换）
_AMAP_GEO_URL = 'https://restapi.amap.com/v3/geocode/geo'


def auto_query_coordinates(spot_name: str) -> Optional[dict]:
    """
    调用高德地理编码 API 查询景点坐标（WGS-84）。
    Returns: {"lat": float, "lng": float} 或 None
    """
    if not _AMAP_KEY:
        return _mock_coordinates(spot_name)

    params = {
        'key': _AMAP_KEY,
        'address': spot_name,
        'output': 'json',
    }
    try:
        resp = requests.get(_AMAP_GEO_URL, params=params, timeout=5)
        data = resp.json()
        geocodes = data.get('geocodes', [])
        if geocodes:
            loc = geocodes[0].get('location', '')
            if loc:
                lng_str, lat_str = loc.split(',', 1)
                return {'lat': float(lat_str), 'lng': float(lng_str)}
    except Exception:
        pass
    return _mock_coordinates(spot_name)


# ──────────────────────────────────────────────────────────
# 标签推断
# ──────────────────────────────────────────────────────────
_TAG_KEYWORDS = {
    '非遗': ['非遗', '传承', '手工', '匠', '泥塑', '兔儿爷', '雕刻', '刺绣', '扎染', '漆器', '景泰蓝'],
    '文化': ['博物馆', '展览', '文化', '书院', '戏楼', '会馆', '故居', '寺庙', '教堂'],
    '美食': ['餐厅', '食堂', '饭馆', '小吃', '咖啡', '茶馆', '甜品', '烧烤', '涮肉', '烤鸭'],
    '老字号': ['老字号', '同仁堂', '瑞蚨祥', '内联升', '步瀛斋', '六必居', '都一处', '张一元', '荣宝斋'],
    '胡同': ['胡同', '巷', '里'],
    '历史建筑': ['楼', '阁', '庙', '殿', '塔', '桥', '城墙', '城门', '遗址'],
    '文艺': ['书屋', '书店', '文具', '文创', '咖啡', 'gallery', 'Gallery'],
    '公园': ['公园', '广场', '绿地'],
}


def infer_tags_from_spot(spot_name: str) -> list[str]:
    """根据景点名称关键词推断标签列表。"""
    tags: list[str] = []
    for tag, keywords in _TAG_KEYWORDS.items():
        if any(kw in spot_name for kw in keywords):
            tags.append(tag)
    return tags if tags else []


# ──────────────────────────────────────────────────────────
# 停留时长推断
# ──────────────────────────────────────────────────────────
_STAY_RULES: list[tuple[list[str], int]] = [
    # (匹配关键词, 默认分钟)
    (['博物馆', '展览', 'Gallery', 'gallery'], 60),
    (['咖啡', '茶馆', '甜品'], 30),
    (['餐厅', '食堂', '饭馆', '小吃', '必吃'], 45),
    (['故居', '寺庙', '教堂', '书院'], 30),
    (['非遗', '手工', '匠', 'DIY', '体验'], 40),
    (['书店', '文具', '书屋'], 25),
    (['公园', '广场'], 15),
    (['胡同', '巷', '里', '老街'], 20),
    (['故居'], 25),
]


def infer_stay_duration(spot_name: str) -> Optional[int]:
    """根据景点类型推断建议停留时长（分钟）。"""
    for keywords, minutes in _STAY_RULES:
        if any(kw in spot_name for kw in keywords):
            return minutes
    return None  # 无法推断，交由用户填写


# ──────────────────────────────────────────────────────────
# URL 内容抓取（用于 URL 模式）
# ──────────────────────────────────────────────────────────
def fetch_url_content(url: str) -> str:
    """
    抓取 URL 正文内容（Markdown 格式）。
    目前为简化实现，可替换为 Firecrawl / Jina Reader 等服务。
    """
    if not url:
        return ''

    # 优先尝试 Jina Reader（免费，无需 key）
    jina_url = f'https://r.jina.ai/{url}'
    try:
        resp = requests.get(jina_url, timeout=10,
                            headers={'Accept': 'text/plain'})
        if resp.status_code == 200 and resp.text.strip():
            return resp.text.strip()
    except Exception:
        pass

    # Fallback：直接 requests（可能只有部分内容）
    try:
        resp = requests.get(url, timeout=8,
                            headers={
                                'User-Agent': 'Mozilla/5.0 (compatible; WeGO Bot/1.0)',
                            })
        if resp.status_code == 200:
            return _strip_html(resp.text)
    except Exception:
        pass

    return ''


def _strip_html(html: str) -> str:
    """简易 HTML → 纯文本（不依赖第三方库）。"""
    text = re.sub(r'(?is)<script[^>]*>.*?</script>', '', html)
    text = re.sub(r'(?is)<style[^>]*>.*?</style>', '', text)
    text = re.sub(r'(?is)<!--.*?-->', '', text)
    text = re.sub(r'(?is)<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:8000]  # 截断防止 token 爆炸


# ──────────────────────────────────────────────────────────
# Mock 坐标（WGS-84，测试/离线时使用）
# ──────────────────────────────────────────────────────────
_DASHILAN_SPOTS = {
    '前门': {'lat': 39.8973, 'lng': 116.3976},
    '大栅栏': {'lat': 39.8966, 'lng': 116.3962},
    '杨梅竹': {'lat': 39.8958, 'lng': 116.3956},
    '青云阁': {'lat': 39.8960, 'lng': 116.3958},
    '瑞蚨祥': {'lat': 39.8965, 'lng': 116.3958},
    '同仁堂': {'lat': 39.8969, 'lng': 116.3970},
    '将将堂': {'lat': 39.8950, 'lng': 116.3948},
    '铃木食堂': {'lat': 39.8945, 'lng': 116.3943},
    '乾坤空间': {'lat': 39.8956, 'lng': 116.3952},
}


def _mock_coordinates(spot_name: str) -> Optional[dict]:
    """Mock：本地已知景点返回固定坐标。"""
    for key, coords in _DASHILAN_SPOTS.items():
        if key in spot_name:
            return coords
    # 未知景点返回大栅栏中心附近偏移
    return None


@tool
def auto_query(action: str, spot_name: str = "", url: str = "") -> str:
    """
    统一自动补全工具：
    - action='coordinates' 使用高德查询坐标
    - action='tags' 推断景点标签
    - action='stay_duration' 推断停留时长
    - action='fetch_url' 抓取 URL 正文
    """
    try:
        if action == "coordinates":
            return json.dumps({"coordinates": auto_query_coordinates(spot_name)}, ensure_ascii=False)
        if action == "tags":
            return json.dumps({"tags": infer_tags_from_spot(spot_name)}, ensure_ascii=False)
        if action == "stay_duration":
            return json.dumps({"estimated_stay_min": infer_stay_duration(spot_name)}, ensure_ascii=False)
        if action == "fetch_url":
            return json.dumps({"content": fetch_url_content(url)}, ensure_ascii=False)
        return json.dumps({"error": f"unsupported action: {action}"}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)
