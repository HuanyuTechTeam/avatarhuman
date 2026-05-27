from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class AvatarRuntime(Protocol):
    opt: Any

    def put_msg_txt(self, msg: str, eventpoint: Any = None) -> None:
        ...

    def put_audio_file(self, filebyte: bytes) -> None:
        ...

    def flush_talk(self) -> None:
        ...

    def set_custom_state(self, audiotype: int, reinit: bool = True) -> None:
        ...

    def start_recording(self) -> None:
        ...

    def stop_recording(self) -> None:
        ...

    def is_speaking(self) -> bool:
        ...

    def render(self, quit_event: Any, loop: Any = None, audio_track: Any = None, video_track: Any = None) -> None:
        ...

    def stop(self) -> None:
        ...


class SpeechSynthesizer(Protocol):
    def put_msg_txt(self, msg: str, eventpoint: Any = None) -> None:
        ...

    def flush_talk(self) -> None:
        ...


class LlmClient(Protocol):
    def generate_reply(self, message: str, runtime: AvatarRuntime) -> None:
        ...


class FrameTransport(Protocol):
    def close(self) -> None:
        ...
