from __future__ import annotations

import asyncio

from backend.application.session_manager import SessionContext
from backend.domain.errors import UnsupportedMessageTypeError
from backend.domain.interfaces import LlmClient


class AvatarOrchestrator:
    def __init__(self, llm_client: LlmClient | None = None):
        self._llm_client = llm_client

    async def handle_human_request(self, context: SessionContext, params: dict) -> None:
        runtime = context.runtime
        voice_id = params.get("voice_id")
        if voice_id:
            context.overrides.voice_id = voice_id
            if hasattr(runtime, "opt"):
                runtime.opt.REF_FILE = voice_id

        if params.get("interrupt"):
            runtime.flush_talk()

        request_type = params["type"]
        if request_type == "echo":
            runtime.put_msg_txt(params["text"])
        elif request_type == "chat":
            if self._llm_client is None:
                raise UnsupportedMessageTypeError("chat mode requires llm client")
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                self._llm_client.generate_reply,
                params["text"],
                runtime,
            )
        else:
            raise UnsupportedMessageTypeError(f"unsupported human type: {request_type}")

        context.touch()

    def handle_audio_upload(self, context: SessionContext, filebytes: bytes) -> None:
        context.runtime.put_audio_file(filebytes)
        context.touch()

    def handle_custom_audio_type(self, context: SessionContext, audiotype: int, reinit: bool) -> None:
        context.runtime.set_custom_state(audiotype, reinit)
        context.touch()

    def handle_record_request(self, context: SessionContext, record_type: str) -> None:
        if record_type == "start_record":
            context.runtime.start_recording()
        elif record_type == "end_record":
            context.runtime.stop_recording()
        else:
            raise UnsupportedMessageTypeError(f"unsupported record type: {record_type}")
        context.touch()

    def is_speaking(self, context: SessionContext) -> bool:
        context.touch()
        return context.runtime.is_speaking()
