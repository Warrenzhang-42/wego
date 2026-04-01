import json
from langchain_core.tools import tool

@tool
def plan_route(user_query: str, current_lat: float, current_lng: float, constraints: dict = None) -> str:
    """
    Generate a suggested walking route visiting multiple points of interest. 
    Use this when the user asks for a recommendation on what to see or how to spend their time.
    Returns a standardized JSON holding route info, polyline, and waypoints.
    Args:
        user_query: Description of what the user wants to see (e.g., '半天不累的路线').
        current_lat: Current user latitude.
        current_lng: Current user longitude.
        constraints: Dictionary including max_hours (float) and max_walk_km (float).
    """
    
    # MOCK implementation returning the required 'route-plan-response' contract JSON
    
    # Ideally, we call AMap Web Service here to calculate duration and distance
    # We will simulate a simple response
    response = {
        "route_name": f"根据您的要求 ({user_query}) 规划的闲逛路线",
        "total_distance_km": 1.5,
        "total_duration_min": 120,
        "total_walk_min": 30,
        "waypoints": [
            {
                "name": "前门大街入口",
                "lat": 39.8973,
                "lng": 116.3976,
                "estimated_stay_min": 10,
                "description": "步入繁华的老街"
            },
            {
                "name": "瑞蚨祥",
                "lat": 39.8965,
                "lng": 116.3958,
                "estimated_stay_min": 30,
                "description": "百年绸缎庄"
            },
            {
                "name": "六必居",
                "lat": 39.8950,
                "lng": 116.3950,
                "estimated_stay_min": 20,
                "description": "咸菜酱园，可以尝尝特色风味"
            }
        ],
        "polyline": [
            {"lat": 39.8973, "lng": 116.3976},
            {"lat": 39.8965, "lng": 116.3958},
            {"lat": 39.8950, "lng": 116.3950}
        ],
        "narration": f"给您安排了一条 {user_query} 的路线。咱们从前门大街溜达，中途去瞧瞧瑞蚨祥，最后去六必居闻闻酱香，轻松又地道！"
    }
    
    return json.dumps(response, ensure_ascii=False)
