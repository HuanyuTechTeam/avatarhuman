from __future__ import annotations

import argparse
import copy
from dataclasses import dataclass
from typing import Any, Iterable, Sequence, Tuple


@dataclass(frozen=True)
class RuntimeSettings:
    fps: int
    batch_size: int
    max_session: int
    width: int
    height: int
    stride_left: int
    stride_middle: int
    stride_right: int


@dataclass(frozen=True)
class TtsSettings:
    provider: str
    ref_file: str
    ref_text: str
    server_url: str


@dataclass(frozen=True)
class ModelSettings:
    name: str
    avatar_id: str
    custom_video_config: str
    custom_options: Tuple[dict[str, Any], ...] = ()


@dataclass(frozen=True)
class TransportSettings:
    mode: str
    push_url: str
    listen_port: int
    api_prefixes: Tuple[str, ...] = ("", "/avatarhuman")
    static_aliases: Tuple[str, ...] = ("/", "/avatarhuman/")


@dataclass(frozen=True)
class AppSettings:
    runtime: RuntimeSettings
    tts: TtsSettings
    model: ModelSettings
    transport: TransportSettings
    avatar_root: str = "data/avatars"
    static_root: str = "web"

    @classmethod
    def from_namespace(cls, namespace: argparse.Namespace) -> "AppSettings":
        customopt = tuple(getattr(namespace, "customopt", []) or [])
        return cls(
            runtime=RuntimeSettings(
                fps=namespace.fps,
                batch_size=namespace.batch_size,
                max_session=namespace.max_session,
                width=namespace.W,
                height=namespace.H,
                stride_left=namespace.l,
                stride_middle=namespace.m,
                stride_right=namespace.r,
            ),
            tts=TtsSettings(
                provider=namespace.tts,
                ref_file=namespace.REF_FILE,
                ref_text=namespace.REF_TEXT,
                server_url=namespace.TTS_SERVER,
            ),
            model=ModelSettings(
                name=namespace.model,
                avatar_id=namespace.avatar_id,
                custom_video_config=namespace.customvideo_config,
                custom_options=customopt,
            ),
            transport=TransportSettings(
                mode=namespace.transport,
                push_url=namespace.push_url,
                listen_port=namespace.listenport,
            ),
        )

    def build_session_options(
            self,
            session_id: int,
            voice_id: str | None = None,
            extra: dict[str, Any] | None = None,
    ) -> argparse.Namespace:
        options = argparse.Namespace(
            fps=self.runtime.fps,
            batch_size=self.runtime.batch_size,
            max_session=self.runtime.max_session,
            W=self.runtime.width,
            H=self.runtime.height,
            l=self.runtime.stride_left,
            m=self.runtime.stride_middle,
            r=self.runtime.stride_right,
            avatar_id=self.model.avatar_id,
            customvideo_config=self.model.custom_video_config,
            customopt=copy.deepcopy(list(self.model.custom_options)),
            tts=self.tts.provider,
            REF_FILE=voice_id or self.tts.ref_file,
            REF_TEXT=self.tts.ref_text,
            TTS_SERVER=self.tts.server_url,
            model=self.model.name,
            transport=self.transport.mode,
            push_url=self.transport.push_url,
            listenport=self.transport.listen_port,
            sessionid=session_id,
        )
        if extra:
            for key, value in extra.items():
                setattr(options, key, value)
        return options

    @property
    def api_prefixes(self) -> Sequence[str]:
        return self.transport.api_prefixes

    @property
    def static_aliases(self) -> Iterable[str]:
        return self.transport.static_aliases


@dataclass
class SessionOverrides:
    voice_id: str | None = None
