import os
import json
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

from llm_settings import (
    load_dotenv_wego,
    openai_api_base_from_env,
    model_candidates_from_env,
    is_gateway_model_routing_error,
)
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

# 必须先加载 WeGO/.env，再 import 依赖 SUPABASE/OPENAI 的 tools
load_dotenv_wego()
load_dotenv()

from tools.search_knowledge import search_knowledge
from tools.web_search import web_search
from tools.plan_route import plan_route
from tools.geofence_narration import geofence_narration
from tools.upload_route import upload_route
from tools.confirm_route_upload import confirm_route_upload
from tools.auto_query import auto_query

# Load Prompts
base_path = Path(__file__).parent
with open(base_path / "prompts" / "system.md", "r", encoding="utf-8") as f:
    system_prompt = f.read()

with open(base_path / "prompts" / "personalities" / "local.md", "r", encoding="utf-8") as f:
    personality_prompt = f.read()

system_message = f"{system_prompt}\n\n{personality_prompt}"

tools = [search_knowledge, web_search, plan_route, geofence_narration, upload_route, confirm_route_upload, auto_query]

_graph_by_model: dict[str, object] = {}


def _get_react_graph(model_name: str):
    if model_name in _graph_by_model:
        return _graph_by_model[model_name]
    llm = ChatOpenAI(
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=openai_api_base_from_env(),
        model=model_name,
        temperature=0.7,
    )
    g = create_react_agent(llm, tools=tools, state_modifier=system_message)
    _graph_by_model[model_name] = g
    return g


def chat_with_agent(user_input: str, thread_id: str = "default_thread", trigger_type: str = None, spot_id: str = None):
    """
    Function to chat with the agent.
    Maintains graph state via thread_id (if we add checkpointer).
    Produces the JSON response.
    """
    config = {"configurable": {"thread_id": thread_id}}

    if trigger_type == "geofence" and spot_id:
        user_input = (
            f"[SYSTEM_TRIGGER: GEOFENCE_ENTER] spot_id={spot_id}. "
            f"请先调用 geofence_narration 工具获取该点知识，再生成符合 chat-message 契约的 JSON 回复。{user_input}"
        )

    inputs = {"messages": [("user", user_input)]}

    candidates = model_candidates_from_env()
    last_exc: Optional[BaseException] = None

    for i, model_name in enumerate(candidates):
        graph = _get_react_graph(model_name)
        response_msg = ""
        try:
            for s in graph.stream(inputs, config=config, stream_mode="values"):
                message = s["messages"][-1]
                if message.type == "ai":
                    response_msg = message.content
            last_exc = None
            break
        except Exception as e:
            last_exc = e
            if is_gateway_model_routing_error(e) and i < len(candidates) - 1:
                continue
            raise

    if last_exc is not None:
        raise last_exc

    content = response_msg.strip()
    if content.startswith("```json"):
        content = content[7:]
    if content.endswith("```"):
        content = content[:-3]

    try:
        parsed = json.loads(content)
        return parsed
    except Exception:
        return {
            "role": "ai",
            "content": content,
            "inserts": []
        }

if __name__ == "__main__":
    # CLI Tests (Task 4.7 Validation)
    import sys
    query = "兔儿爷为什么骑老虎"
    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])

    print(f"User: {query}")
    print("-" * 50)
    result = chat_with_agent(query)
    print("AI JSON Response:")
    print(json.dumps(result, ensure_ascii=False, indent=2))
