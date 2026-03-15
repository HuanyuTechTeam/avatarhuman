from __future__ import annotations

import json
from dataclasses import dataclass

from aiohttp import web
from aiohttp.web_exceptions import HTTPBadRequest

from backend.application.orchestrator import AvatarOrchestrator
from backend.application.session_manager import SessionManager
from backend.domain.errors import MaxSessionReachedError, SessionNotFoundError, UnsupportedMessageTypeError
from backend.infrastructure.coze_proxy import create_conversation, stream_chat


@dataclass(frozen=True)
class HandlerBundle:
    offer: callable
    human: callable
    humanaudio: callable
    set_audiotype: callable
    record: callable
    is_speaking: callable
    coze_create_conversation: callable
    coze_chat: callable


def json_response(payload: dict, status: int = 200) -> web.Response:
    return web.Response(content_type="application/json", status=status, text=json.dumps(payload))


def coerce_session_id(params: dict) -> int:
    if "sessionid" not in params:
        raise HTTPBadRequest(text="missing field: sessionid")
    try:
        return int(params["sessionid"])
    except (TypeError, ValueError) as exc:
        raise HTTPBadRequest(text="invalid sessionid") from exc


def require_field(params: dict, field_name: str):
    if field_name not in params:
        raise HTTPBadRequest(text=f"missing field: {field_name}")
    return params[field_name]


def create_handler_bundle(
    session_service,
    orchestrator: AvatarOrchestrator,
    session_manager: SessionManager,
) -> HandlerBundle:
    async def offer(request: web.Request) -> web.Response:
        try:
            params = await request.json()
            return json_response(await session_service.create_offer_session(params))
        except MaxSessionReachedError as exc:
            return json_response({"code": -1, "msg": str(exc)}, status=429)
        except (KeyError, HTTPBadRequest, ValueError) as exc:
            return json_response({"code": -1, "msg": str(exc)}, status=400)

    async def human(request: web.Request) -> web.Response:
        try:
            params = await request.json()
            context = session_manager.get_required(coerce_session_id(params))
            require_field(params, "type")
            require_field(params, "text")
            await orchestrator.handle_human_request(context, params)
            return json_response({"code": 0, "data": "ok"})
        except SessionNotFoundError:
            return json_response({"code": -1, "msg": "Session not found"}, status=404)
        except (HTTPBadRequest, KeyError, ValueError) as exc:
            return json_response({"code": -1, "msg": str(exc)}, status=400)
        except UnsupportedMessageTypeError as exc:
            return json_response({"code": -1, "msg": str(exc)}, status=400)

    async def humanaudio(request: web.Request) -> web.Response:
        try:
            form = await request.post()
            context = session_manager.get_required(coerce_session_id(form))
            fileobj = require_field(form, "file")
            orchestrator.handle_audio_upload(context, fileobj.file.read())
            return json_response({"code": 0, "msg": "ok"})
        except SessionNotFoundError:
            return json_response({"code": -1, "msg": "Session not found"}, status=404)
        except (HTTPBadRequest, KeyError, ValueError) as exc:
            return json_response({"code": -1, "msg": str(exc)}, status=400)
        except Exception as exc:
            return json_response({"code": -1, "msg": "err", "data": str(exc)}, status=500)

    async def set_audiotype(request: web.Request) -> web.Response:
        try:
            params = await request.json()
            context = session_manager.get_required(coerce_session_id(params))
            orchestrator.handle_custom_audio_type(
                context,
                require_field(params, "audiotype"),
                require_field(params, "reinit"),
            )
            return json_response({"code": 0, "data": "ok"})
        except SessionNotFoundError:
            return json_response({"code": -1, "msg": "Session not found"}, status=404)
        except (HTTPBadRequest, KeyError, ValueError) as exc:
            return json_response({"code": -1, "msg": str(exc)}, status=400)

    async def record(request: web.Request) -> web.Response:
        try:
            params = await request.json()
            context = session_manager.get_required(coerce_session_id(params))
            orchestrator.handle_record_request(context, require_field(params, "type"))
            return json_response({"code": 0, "data": "ok"})
        except SessionNotFoundError:
            return json_response({"code": -1, "msg": "Session not found"}, status=404)
        except (HTTPBadRequest, KeyError, ValueError) as exc:
            return json_response({"code": -1, "msg": str(exc)}, status=400)
        except UnsupportedMessageTypeError as exc:
            return json_response({"code": -1, "msg": str(exc)}, status=400)

    async def is_speaking(request: web.Request) -> web.Response:
        try:
            params = await request.json()
            context = session_manager.get_required(coerce_session_id(params))
            return json_response({"code": 0, "data": orchestrator.is_speaking(context)})
        except SessionNotFoundError:
            return json_response({"code": -1, "data": False, "msg": "Session not found"}, status=404)
        except (HTTPBadRequest, KeyError, ValueError) as exc:
            return json_response({"code": -1, "msg": str(exc)}, status=400)

    async def coze_create_conversation(_request: web.Request) -> web.Response:
        payload = await create_conversation()
        return json_response(payload)

    async def coze_chat(request: web.Request) -> web.StreamResponse:
        params = await request.json()
        upstream_session, upstream_response = await stream_chat(params)

        stream_response = web.StreamResponse(
            status=200,
            headers={
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        )
        await stream_response.prepare(request)

        try:
            async for chunk in upstream_response.content.iter_chunked(1024):
                await stream_response.write(chunk)
        finally:
            await upstream_response.release()
            await upstream_session.close()

        await stream_response.write_eof()
        return stream_response

    return HandlerBundle(
        offer=offer,
        human=human,
        humanaudio=humanaudio,
        set_audiotype=set_audiotype,
        record=record,
        is_speaking=is_speaking,
        coze_create_conversation=coze_create_conversation,
        coze_chat=coze_chat,
    )


def register_routes(app: web.Application, handlers: HandlerBundle, prefixes: tuple[str, ...]) -> None:
    route_specs = (
        ("offer", handlers.offer),
        ("human", handlers.human),
        ("humanaudio", handlers.humanaudio),
        ("set_audiotype", handlers.set_audiotype),
        ("record", handlers.record),
        ("is_speaking", handlers.is_speaking),
        ("coze/conversation/create", handlers.coze_create_conversation),
        ("coze/chat", handlers.coze_chat),
    )

    for prefix in prefixes:
        normalized_prefix = prefix.rstrip("/")
        for name, handler in route_specs:
            app.router.add_post(f"{normalized_prefix}/{name}" if normalized_prefix else f"/{name}", handler)
