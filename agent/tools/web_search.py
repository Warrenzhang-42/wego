import os
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_core.tools import tool

# Attempt to load Tavily tool if key is present
tavily_api_key = os.getenv("TAVILY_API_KEY")
tavily_tool = None
if tavily_api_key and tavily_api_key != "YOUR_TAVILY_API_KEY":
    tavily_tool = TavilySearchResults(max_results=3)

@tool
def web_search(query: str) -> str:
    """
    Search the live internet for up-to-date facts, current events, or missing knowledge.
    Use this ONLY when 'search_knowledge' yields no result or for real-time information.
    Args:
        query: The search term or question.
    """
    if tavily_tool:
        try:
            res = tavily_tool.invoke({"query": query})
            return "\n".join([f"{item['url']}: {item['content']}" for item in res])
        except Exception as e:
            return f"网络搜索失败：{str(e)}"
    
    # Mock fallback if no API key is set
    return f"[实时搜索 MOCK] 关于 '{query}'：近期的天气适中，部分餐厅人潮较多，推荐工作日拜访。"
