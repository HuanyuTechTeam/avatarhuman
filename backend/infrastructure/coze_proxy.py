from __future__ import annotations

import os
from typing import Any

import aiohttp
from aiohttp import web

COZE_API_BASE = "https://api.coze.cn"


def get_coze_credentials() -> tuple[str, str]:
    token = os.getenv("COZE_API_TOKEN", "").strip()
    bot_id = os.getenv("COZE_BOT_ID", "").strip()
    if not token or not bot_id:
        raise web.HTTPServiceUnavailable(
            text="Coze proxy is not configured. Please set COZE_API_TOKEN and COZE_BOT_ID.",
        )
    return token, bot_id


async def create_conversation() -> dict[str, Any]:
    token, bot_id = get_coze_credentials()
    async with aiohttp.ClientSession() as session:
        async with session.post(
                f"{COZE_API_BASE}/v1/conversation/create",
                headers={
                    "Authorization": token,
                    "Content-Type": "application/json",
                },
                json={"bot_id": bot_id},
        ) as response:
            if response.status >= 400:
                raise web.HTTPBadGateway(text=await response.text())
            return await response.json()


async def stream_chat(request_payload: dict[str, Any]) -> tuple[aiohttp.ClientSession, aiohttp.ClientResponse]:
    token, bot_id = get_coze_credentials()
    text = str(request_payload.get("text", "")).strip()
    if not text:
        raise web.HTTPBadRequest(text="missing field: text")

    conversation_id = str(request_payload.get("conversationId", "")).strip()
    request_url = (
        f"{COZE_API_BASE}/v3/chat?conversation_id={conversation_id}"
        if conversation_id
        else f"{COZE_API_BASE}/v3/chat"
    )
    request_body = {
        "bot_id": bot_id,
        "user_id": "1",
        "stream": True,
        "auto_save_history": True,
        "additional_messages": [
            {
                "role": "user",
                "content": text,
                "content_type": "text",
            }
        ],
    }

    session = aiohttp.ClientSession()
    try:
        response = await session.post(
            request_url,
            headers={
                "Authorization": token,
                "Content-Type": "application/json",
            },
            json=request_body,
        )
        if response.status >= 400:
            error_text = await response.text()
            await response.release()
            raise web.HTTPBadGateway(text=error_text)
        return session, response
    except Exception:
        await session.close()
        raise
