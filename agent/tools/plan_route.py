import json
import math
from langchain_core.tools import tool

# 大栅栏/杨梅竹斜街/前门区域的代表性景点知识库（用于规划路线候选池）
SPOT_CANDIDATES = [
    {
        "name": "前门大街入口",
        "lat": 39.8973, "lng": 116.3976,
        "estimated_stay_min": 10,
        "walk_km_from_prev": 0,
        "tags": ["地标", "商业街"],
        "description": "步入繁华老街，感受老北京的市井气息"
    },
    {
        "name": "张忠强兔儿爷非遗传承店",
        "lat": 39.8966, "lng": 116.3962,
        "estimated_stay_min": 30,
        "walk_km_from_prev": 0.18,
        "tags": ["非遗", "手工艺", "文化"],
        "description": "北京非物质文化遗产·兔儿爷泥塑传承店"
    },
    {
        "name": "青云阁及二层模范咖啡",
        "lat": 39.8960, "lng": 116.3958,
        "estimated_stay_min": 45,
        "walk_km_from_prev": 0.12,
        "tags": ["咖啡", "历史建筑", "文艺"],
        "description": "清末商业楼阁，二层有宝藏精品咖啡馆"
    },
    {
        "name": "乾坤空间文创",
        "lat": 39.8956, "lng": 116.3952,
        "estimated_stay_min": 25,
        "walk_km_from_prev": 0.10,
        "tags": ["文创", "展览"],
        "description": "可以逛的艺术展览空间"
    },
    {
        "name": "将将堂印章",
        "lat": 39.8950, "lng": 116.3948,
        "estimated_stay_min": 20,
        "walk_km_from_prev": 0.09,
        "tags": ["手工艺", "定制", "文化"],
        "description": "低流量但高转化的深度体验型刻章小店"
    },
    {
        "name": "瑞蚨祥",
        "lat": 39.8965, "lng": 116.3958,
        "estimated_stay_min": 30,
        "walk_km_from_prev": 0.15,
        "tags": ["老字号", "丝绸"],
        "description": "百年绸缎庄，感受京城传统商业文化"
    },
    {
        "name": "六必居",
        "lat": 39.8950, "lng": 116.3950,
        "estimated_stay_min": 20,
        "walk_km_from_prev": 0.20,
        "tags": ["老字号", "美食"],
        "description": "咸菜酱园，可以尝尝特色风味"
    },
    {
        "name": "铃木食堂",
        "lat": 39.8945, "lng": 116.3943,
        "estimated_stay_min": 60,
        "walk_km_from_prev": 0.10,
        "tags": ["餐厅", "美食", "高情绪"],
        "description": "高情绪价值型餐厅，适合旅程收尾"
    }
]


def haversine(lat1, lng1, lat2, lng2):
    """计算两点间距离（公里）"""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.asin(math.sqrt(a))


def filter_spots_by_constraints(candidates, constraints, current_lat, current_lng):
    """
    按约束条件裁减候选景点列表。
    constraints: { max_hours: float, max_walk_km: float, themes: list[str] }
    """
    if not constraints:
        return candidates[:5]  # 默认取前 5 个

    max_hours = constraints.get('max_hours', 4)
    max_walk_km = constraints.get('max_walk_km', 3)
    themes = constraints.get('themes', [])

    # 1. 按主题过滤（如果指定了主题）
    if themes:
        theme_filtered = [
            s for s in candidates
            if any(t in s.get('tags', []) for t in themes)
        ]
        if theme_filtered:
            candidates = theme_filtered

    # 2. 按距离当前位置排序（近的优先）
    candidates = sorted(candidates, key=lambda s: haversine(current_lat, current_lng, s['lat'], s['lng']))

    # 3. 贪心选择：累计停留时间不超过 max_hours，累计步行不超过 max_walk_km
    max_stay_min = max_hours * 60
    selected = []
    total_stay = 0
    total_walk = 0

    for spot in candidates:
        stay = spot['estimated_stay_min']
        walk = spot['walk_km_from_prev']
        if total_stay + stay <= max_stay_min and total_walk + walk <= max_walk_km:
            selected.append(spot)
            total_stay += stay
            total_walk += walk

    return selected if selected else candidates[:3]


@tool
def plan_route(user_query: str, current_lat: float = 39.8973, current_lng: float = 116.3976, constraints: dict = None) -> str:
    """
    Generate a suggested walking route visiting multiple points of interest.
    Use this when the user asks for a recommendation on what to see, how to plan their time,
    or what route to take. Supports constraint-based pruning.
    Args:
        user_query: Description of what the user wants to see (e.g., '半天不累的路线', '非遗体验').
        current_lat: Current user latitude. Defaults to Qianmen area.
        current_lng: Current user longitude. Defaults to Qianmen area.
        constraints: Optional dict with max_hours (float), max_walk_km (float), themes (list[str]).
                     Example: {"max_hours": 2.5, "max_walk_km": 1.5, "themes": ["非遗", "文化"]}
    """
    # 根据查询词推断主题（简单关键词匹配，增强意图理解）
    inferred_themes = []
    if any(kw in user_query for kw in ['非遗', '手工', '传统', '文化', '历史']):
        inferred_themes.extend(['非遗', '手工艺', '文化', '历史建筑'])
    if any(kw in user_query for kw in ['吃', '美食', '餐', '饭']):
        inferred_themes.extend(['美食', '餐厅', '老字号'])
    if any(kw in user_query for kw in ['咖啡', '文艺', '打卡', '拍照']):
        inferred_themes.extend(['咖啡', '文艺', '文创'])
    if any(kw in user_query for kw in ['老字号', '商业']):
        inferred_themes.extend(['老字号', '商业街'])

    # 合并用户指定主题和推断主题
    if constraints is None:
        constraints = {}
    if inferred_themes and not constraints.get('themes'):
        constraints['themes'] = inferred_themes

    # 根据查询词推断时间约束（"半天" → 4h，"两小时"/"俩小时" → 2h）
    if 'max_hours' not in constraints:
        if '半天' in user_query:
            constraints['max_hours'] = 3.5
        elif '一天' in user_query or '全天' in user_query:
            constraints['max_hours'] = 7
        elif '两小时' in user_query or '俩小时' in user_query or '2小时' in user_query:
            constraints['max_hours'] = 2
        else:
            constraints['max_hours'] = 4  # 默认 4 小时

    if 'max_walk_km' not in constraints and '不累' in user_query:
        constraints['max_walk_km'] = 1.5

    selected = filter_spots_by_constraints(SPOT_CANDIDATES, constraints, current_lat, current_lng)

    # 构建简单折线（按景点顺序）
    polyline = [{"lat": s["lat"], "lng": s["lng"]} for s in selected]

    # 计算路线统计
    total_stay = sum(s['estimated_stay_min'] for s in selected)
    total_walk_km = sum(s['walk_km_from_prev'] for s in selected)
    walk_speed_kmh = 4.5
    walk_min = round(total_walk_km / walk_speed_kmh * 60)

    # 生成口语化开场白
    spot_names = '→'.join(s['name'] for s in selected)
    narration_lines = [
        f"好嘞！给您安排了一条「{user_query}」的路线，共 {len(selected)} 站：{spot_names}。",
        f"全程步行约 {total_walk_km:.1f} 公里，走走停停大概 {total_stay + walk_min} 分钟。",
    ]
    if constraints.get('max_hours'):
        narration_lines.append(f"完全在您 {constraints['max_hours']} 小时的预算以内，轻松搞定！")

    response = {
        "route_name": f"{user_query} · WeGO 精选路线",
        "total_distance_km": round(total_walk_km, 2),
        "total_duration_min": total_stay + walk_min,
        "total_walk_min": walk_min,
        "waypoints": [
            {
                "name": s["name"],
                "lat": s["lat"],
                "lng": s["lng"],
                "estimated_stay_min": s["estimated_stay_min"],
                "description": s["description"]
            }
            for s in selected
        ],
        "polyline": polyline,
        "narration": " ".join(narration_lines)
    }

    return json.dumps(response, ensure_ascii=False)
