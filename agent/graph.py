import os
import json
from pathlib import Path
from dotenv import load_dotenv

from langchain_core.messages import SystemMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from tools.search_knowledge import search_knowledge
from tools.web_search import web_search
from tools.plan_route import plan_route

load_dotenv()

# Load Prompts
base_path = Path(__file__).parent
with open(base_path / "prompts" / "system.md", "r", encoding="utf-8") as f:
    system_prompt = f.read()

with open(base_path / "prompts" / "personalities" / "local.md", "r", encoding="utf-8") as f:
    personality_prompt = f.read()

# Setup Chat Model
# Allows overriding model and base URL for providers like DeepSeek 
openai_api_key = os.getenv("OPENAI_API_KEY")
openai_api_base = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
openai_api_model = os.getenv("OPENAI_API_MODEL", "gpt-4o-mini")

llm = ChatOpenAI(
    api_key=openai_api_key,
    base_url=openai_api_base,
    model=openai_api_model,
    temperature=0.7,
)

tools = [search_knowledge, web_search, plan_route]

# Create LangGraph ReAct Agent
system_message = f"{system_prompt}\n\n{personality_prompt}"

graph = create_react_agent(llm, tools=tools, state_modifier=system_message)

def chat_with_agent(user_input: str, thread_id: str = "default_thread", trigger_type: str = None, spot_id: str = None):
    """
    Function to chat with the agent. 
    Maintains graph state via thread_id (if we add checkpointer).
    Produces the JSON response.
    """
    config = {"configurable": {"thread_id": thread_id}}
    
    if trigger_type == "geofence" and spot_id:
        user_input = f"[SYSTEM_TRIGGER: GEOFENCE_ENTER] Spot: {spot_id}. {user_input}"

    inputs = {"messages": [("user", user_input)]}
    
    # We run the graph and get the final state
    response_msg = ""
    for s in graph.stream(inputs, config=config, stream_mode="values"):
        message = s["messages"][-1]
        # We can print for CLI debug
        # print(f"[{message.type}]: {message.content}")
        if message.type == "ai":
            response_msg = message.content

    # Safety check - parse JSON if the model wrapped it in markdown
    content = response_msg.strip()
    if content.startswith("```json"):
        content = content[7:]
    if content.endswith("```"):
        content = content[:-3]
        
    try:
        # Validate JSON
        parsed = json.loads(content)
        return parsed
    except Exception as e:
        # Fallback raw output
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
