from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from time import time
from typing import Any

from backend.domain.errors import MaxSessionReachedError, SessionNotFoundError
from backend.domain.interfaces import AvatarRuntime, FrameTransport
from backend.domain.settings import AppSettings, SessionOverrides


@dataclass
class SessionContext:
    session_id: int
    runtime: AvatarRuntime
    config: AppSettings | Any
    overrides: SessionOverrides = field(default_factory=SessionOverrides)
    peer_connection: Any = None
    player: FrameTransport | Any = None
    created_at: float = field(default_factory=time)
    last_active_at: float = field(default_factory=time)

    def touch(self) -> None:
        self.last_active_at = time()


class SessionManager:
    def __init__(self, max_sessions: int | None = None):
        self._contexts: dict[int, SessionContext] = {}
        self._max_sessions = max_sessions
        self._reserved_session_ids: set[int] = set()

    def ensure_capacity(self) -> None:
        active_count = len(self._contexts) + len(self._reserved_session_ids)
        if self._max_sessions is not None and active_count >= self._max_sessions:
            raise MaxSessionReachedError("reach max session")

    def reserve(self, session_id: int) -> None:
        self.ensure_capacity()
        self._reserved_session_ids.add(session_id)

    def release_reservation(self, session_id: int) -> None:
        self._reserved_session_ids.discard(session_id)

    def add_context(self, context: SessionContext) -> None:
        self.release_reservation(context.session_id)
        self._contexts[context.session_id] = context

    def get(self, session_id: int) -> SessionContext | None:
        return self._contexts.get(session_id)

    def get_required(self, session_id: int) -> SessionContext:
        context = self.get(session_id)
        if context is None:
            raise SessionNotFoundError(f"session {session_id} not found")
        context.touch()
        return context

    def pop(self, session_id: int) -> SessionContext | None:
        self.release_reservation(session_id)
        return self._contexts.pop(session_id, None)

    async def close_session(self, session_id: int) -> None:
        context = self.pop(session_id)
        if context is None:
            return

        stop = getattr(context.runtime, "stop", None)
        if callable(stop):
            result = stop()
            if asyncio.iscoroutine(result):
                await result

        player_close = getattr(context.player, "close", None)
        if callable(player_close):
            result = player_close()
            if asyncio.iscoroutine(result):
                await result

        if context.peer_connection is not None:
            await context.peer_connection.close()

    async def close_all(self) -> None:
        for session_id in list(self._contexts):
            await self.close_session(session_id)

    def __len__(self) -> int:
        return len(self._contexts)
