from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import json
import asyncio
from pydantic import BaseModel
from typing import Optional, Dict

# Assuming chat_with_agent is implemented asynchronously or we just run it in a thread. 
# We'll adapt it to work async or we just use run_in_executor
from graph import chat_with_agent

app = FastAPI(title="WeGO Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    user_query: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    radius_m: Optional[int] = None
    thread_id: str = "default_thread"
    trigger_type: Optional[str] = None  # e.g., 'geofence'
    spot_id: Optional[str] = None


async def _sse_event_bytes(req: ChatRequest):
    """Sprint 4.8：整段 JSON 分片 SSE 输出，末尾 [DONE]。"""
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None,
            lambda: chat_with_agent(
                req.user_query,
                req.thread_id,
                req.trigger_type,
                req.spot_id,
            ),
        )
    except Exception as e:
        # LLM/网络失败时仍输出合法 SSE，避免客户端半包与 ASGI ExceptionGroup
        result = {
            "role": "ai",
            "content": f"Agent 暂时不可用：{e!s}",
            "inserts": [],
        }
    json_str = json.dumps(result, ensure_ascii=False)
    chunk_size = 5
    for i in range(0, len(json_str), chunk_size):
        chunk = json_str[i : i + chunk_size]
        yield f"data: {json.dumps({'chunk': chunk}, ensure_ascii=False)}\n\n"
        await asyncio.sleep(0.01)
    yield "data: [DONE]\n\n"


@app.post("/chat")
async def chat_endpoint(req: ChatRequest):
    """
    Standard JSON endpoint for chatting.
    """
    try:
        return chat_with_agent(
            req.user_query,
            req.thread_id,
            trigger_type=req.trigger_type,
            spot_id=req.spot_id,
        )
    except Exception as e:
        return {
            "role": "ai",
            "content": f"Agent 暂时不可用：{e!s}",
            "inserts": [],
        }


@app.post("/chat/stream")
async def chat_stream_post(req: ChatRequest):
    """POST + JSON body，供 Edge Function 与前端 fetch 流式读取（Sprint 4.8）。"""
    return StreamingResponse(_sse_event_bytes(req), media_type="text/event-stream")


@app.get("/chat/stream")
async def chat_stream_endpoint(
    user_query: str,
    thread_id: str = "default_thread",
    trigger_type: Optional[str] = None,
    spot_id: Optional[str] = None,
):
    """
    SSE（GET + query）兼容旧调用；推荐使用 POST /chat/stream。
    """
    req = ChatRequest(
        user_query=user_query,
        thread_id=thread_id,
        trigger_type=trigger_type,
        spot_id=spot_id,
    )
    return StreamingResponse(_sse_event_bytes(req), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
