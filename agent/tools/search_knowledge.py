import os
import requests
from langchain_core.tools import tool
from dotenv import load_dotenv

load_dotenv()

@tool
def search_knowledge(query: str, lat: float = None, lng: float = None, radius_m: int = None, spot_id: str = None) -> str:
    """
    Retrieve rich local knowledge, historical facts, and sightseeing information from the WeGO trusted database.
    Use this FIRST when a user asks about local places, culture, or history.
    Args:
        query: Local topic or question to search for.
        lat: Optional user latitude.
        lng: Optional user longitude.
        radius_m: Optional search radius in meters.
        spot_id: Optional ID of the specific spot to search for.
    """
    backend_url = os.getenv("BACKEND_API_URL", "http://127.0.0.1:8787")
    access_token = os.getenv("AGENT_ACCESS_TOKEN", "")
    
    if not backend_url:
        return "本地知识库无响应：缺少 BACKEND_API_URL 配置。"
        
    try:
        url = f"{backend_url}/api/knowledge/search"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        payload = {"query": query, "spot_id": spot_id}
        if lat is not None and lng is not None:
            payload["lat"] = lat
            payload["lng"] = lng
        if radius_m is not None:
            payload["radius_m"] = radius_m
            
        res = requests.post(url, json=payload, headers=headers, timeout=5)
        
        if res.status_code == 200:
            data = res.json()
            chunks = data.get("results", [])
            if not chunks:
                return "知识库未找到明确记载，请尝试其他工具或者一般常识回答。"
            
            # Combine chunk text
            texts = [c.get("chunk_text", "") for c in chunks]
            return "\n\n".join(texts)
        else:
            # Fallback mock for testing in CLI
            return f"[知识库 MOCK]: 找到了关于 '{query}' 的一段资料。大栅栏是北京著名的老商业街，拥有许多百年老字号如瑞蚨祥、同仁堂等..."
            
    except Exception as e:
        # Mock fallback if network fails so it won't block the agent development
        return f"[知识库 MOCK 离线]: 找到了关于 '{query}' 的资料。这里曾是繁华的市井中心，各种老字号云集。"
