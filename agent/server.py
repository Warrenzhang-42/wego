from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import json
import asyncio
from pydantic import BaseModel
from typing import Optional, Dict

from llm_settings import load_dotenv_wego

load_dotenv_wego()

from graph import chat_with_agent
from tools.upload_route import upload_route
from tools.confirm_route_upload import confirm_route_upload

app = FastAPI(title="WeGO Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────────────────
# Chat 端点（Sprint 4.8）
# ──────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    user_query: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    radius_m: Optional[int] = None
    thread_id: str = "default_thread"
    trigger_type: Optional[str] = None
    spot_id: Optional[str] = None
    file_content: Optional[str] = None
    file_type: Optional[str] = None
    session_id: Optional[str] = None
    source_url: Optional[str] = None


async def _sse_event_bytes(req: ChatRequest):
    """整段 JSON 分片 SSE 输出，末尾 [DONE]（Sprint 4.8）。"""
    loop = asyncio.get_event_loop()
    try:
        if req.file_content and req.file_type:
            result_str = upload_route.invoke({
                'file_content': req.file_content,
                'file_type': req.file_type,
                'session_id': req.session_id or req.thread_id,
            })
            result = json.loads(result_str)
        else:
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
    """Standard JSON endpoint for chatting (supports upload mode)."""
    try:
        if req.file_content and req.file_type:
            result_str = upload_route.invoke({
                'file_content': req.file_content,
                'file_type': req.file_type,
                'session_id': req.session_id or req.thread_id,
            })
            return json.loads(result_str)
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
    """POST + JSON body，SSE 流式读取（Sprint 4.8）。"""
    return StreamingResponse(_sse_event_bytes(req), media_type="text/event-stream")


@app.get("/chat/stream")
async def chat_stream_endpoint(
    user_query: str,
    thread_id: str = "default_thread",
    trigger_type: Optional[str] = None,
    spot_id: Optional[str] = None,
):
    """SSE（GET + query）兼容旧调用；推荐使用 POST /chat/stream。"""
    req = ChatRequest(
        user_query=user_query,
        thread_id=thread_id,
        trigger_type=trigger_type,
        spot_id=spot_id,
    )
    return StreamingResponse(_sse_event_bytes(req), media_type="text/event-stream")


# ──────────────────────────────────────────────────────────
# 路线上传端点（Sprint 11.4.2）
# ──────────────────────────────────────────────────────────
class RouteUploadRequest(BaseModel):
    session_id: str
    file_content: str
    file_type: str  # json | markdown | txt | url
    source_url: Optional[str] = None


class RouteConfirmRequest(BaseModel):
    session_id: str
    confirmed: bool
    overrides: list[dict] = []


class RouteGapReplyRequest(BaseModel):
    session_id: str
    overrides: list[dict] = []


@app.post("/route-upload")
async def route_upload(req: RouteUploadRequest):
    """
    接收上传请求，调用 Agent upload_route 工具，返回解析状态和 Gap 列表。
    Sprint 11.4.2。
    """
    try:
        result_str = upload_route.invoke({
            'file_content': req.file_content,
            'file_type': req.file_type,
            'session_id': req.session_id,
        })
        try:
            return json.loads(result_str)
        except Exception:
            return {'status': 'error', 'error': f'工具返回格式异常: {result_str}'}
    except Exception as e:
        return {'status': 'error', 'error': str(e)}


@app.post("/route-upload/gap-reply")
async def route_gap_reply_http(req: RouteGapReplyRequest):
    """
    后台 Agent 交流：仅更新 route_drafts（parsed_data / gap_items / user_overrides），不入库 routes。
    """
    from tools.route_gap_reply import process_gap_reply

    return process_gap_reply(req.session_id, req.overrides or [])


@app.post("/route-upload/confirm")
async def route_confirm(req: RouteConfirmRequest):
    """
    确认路线写入：应用用户 overrides，执行数据库 upsert。
    Sprint 11.4.2。
    """
    try:
        result_str = confirm_route_upload.invoke({
            'session_id': req.session_id,
            'confirmed': req.confirmed,
            'overrides': req.overrides or [],
        })
        try:
            return json.loads(result_str)
        except Exception:
            return {'status': 'error', 'error': f'工具返回格式异常: {result_str}'}
    except Exception as e:
        return {'status': 'error', 'error': str(e)}


@app.get("/route-upload/{session_id}")
async def route_upload_status(session_id: str):
    """
    查询会话状态（Sprint 11.4.2）。
    目前为简化实现，直接从 route_drafts 读取状态。
    """
    import os
    supabase_url = os.getenv('SUPABASE_URL', '')
    supabase_key = os.getenv('SUPABASE_ANON_KEY', '')
    if not supabase_url:
        return {'session_id': session_id, 'status': 'unknown', 'error': 'SUPABASE_URL not configured'}

    import requests as _req
    try:
        resp = _req.get(
            f'{supabase_url}/rest/v1/route_drafts',
            headers={'apikey': supabase_key, 'Authorization': f'Bearer {supabase_key}'},
            params={'session_id': f'eq.{session_id}', 'select': 'status,parsed_data,gap_items'},
            timeout=5,
        )
        if resp.ok and resp.json():
            row = resp.json()[0]
            return {
                'session_id': session_id,
                'status': row.get('status'),
                'parsed_data': row.get('parsed_data'),
                'gap_items': row.get('gap_items'),
            }
    except Exception as e:
        pass

    return {'session_id': session_id, 'status': 'unknown', 'error': 'not found'}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
