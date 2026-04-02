"""
Sprint 5.3 — 围栏触发时拉取景点知识，供 Agent 生成「嘿，你注意到…」类开场白。
"""
from langchain_core.tools import tool

from tools.search_knowledge import search_knowledge


@tool
def geofence_narration(spot_id: str, spot_name: str = "") -> str:
    """
    当旅行者进入某景点地理围栏时调用：按 spot_id 检索本地知识库片段，用于主动讲解开场。
    Args:
        spot_id: 景点 UUID（与 contracts/route 中 spot.id 一致）。
        spot_name: 景点中文名，用于提高检索相关性（可选）。
    """
    query = f"{spot_name} 历史 看点 故事".strip() if spot_name else "景点介绍"
    return search_knowledge.invoke(
        {"query": query, "lat": None, "lng": None, "radius_m": None, "spot_id": spot_id}
    )
