from fastapi import FastAPI, Request
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

@app.post("/chat")
async def chat_endpoint(req: ChatRequest):
    """
    Standard JSON endpoint for chatting.
    """
    result = chat_with_agent(
        req.user_query, 
        req.thread_id, 
        trigger_type=req.trigger_type, 
        spot_id=req.spot_id
    )
    return result

@app.get("/chat/stream")
async def chat_stream_endpoint(
    request: Request, 
    user_query: str, 
    thread_id: str = "default_thread",
    trigger_type: Optional[str] = None,
    spot_id: Optional[str] = None
):
    """
    SSE Endpoint for streaming output.
    To truly stream JSON from an LLM implies complex partial JSON parsing.
    For this MVP, we will compute the full answer, then stream it character by character
    to simulate a typewriter effect, OR we just yield the final JSON as a single SSE event.
    
    Here we stream the JSON string artificially to satisfy the "打字机" (typewriter) UX.
    """
    async def event_stream():
        # Get full result
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, 
            chat_with_agent, 
            user_query, 
            thread_id,
            trigger_type,
            spot_id
        )
        
        json_str = json.dumps(result, ensure_ascii=False)
        
        # Simulate token stream
        # E.g. yielding chunks of 5 chars
        chunk_size = 5
        for i in range(0, len(json_str), chunk_size):
            chunk = json_str[i:i+chunk_size]
            yield f"data: {json.dumps({'chunk': chunk}, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0.01)
            
        yield "data: [DONE]\n\n"
        
    return StreamingResponse(event_stream(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
