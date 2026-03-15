from __future__ import annotations

import asyncio
import random
from typing import Any

from backend.application.session_manager import SessionContext, SessionManager
from backend.domain.settings import AppSettings, SessionOverrides
from backend.infrastructure.runtime_factory import RuntimeFactory
from logger import logger


async def cleanup_partial_session(
    session_manager: SessionManager,
    session_id: int,
    runtime: Any = None,
    player: Any = None,
    peer_connection: Any = None,
) -> None:
    if session_manager.get(session_id) is not None:
        await session_manager.close_session(session_id)
        return

    session_manager.release_reservation(session_id)

    if runtime is not None and hasattr(runtime, "stop"):
        result = runtime.stop()
        if asyncio.iscoroutine(result):
            await result

    if player is not None and hasattr(player, "close"):
        result = player.close()
        if asyncio.iscoroutine(result):
            await result

    if peer_connection is not None and hasattr(peer_connection, "close"):
        result = peer_connection.close()
        if asyncio.iscoroutine(result):
            await result


def rand_n(length: int) -> int:
    minimum = pow(10, length - 1)
    maximum = pow(10, length)
    return random.randint(minimum, maximum - 1)


class SessionService:
    def __init__(self, settings: AppSettings, session_manager: SessionManager, runtime_factory: RuntimeFactory):
        self._settings = settings
        self._session_manager = session_manager
        self._runtime_factory = runtime_factory
        self._session_creation_lock = asyncio.Lock()

    async def create_offer_session(self, params: dict) -> dict:
        from aiortc import RTCConfiguration, RTCIceServer, RTCPeerConnection, RTCSessionDescription
        from webrtc import HumanPlayer

        async with self._session_creation_lock:
            offer = RTCSessionDescription(sdp=params["sdp"], type=params["type"])
            session_id = self._allocate_session_id()
            self._session_manager.reserve(session_id)
            logger.info("sessionid=%d", session_id)

            runtime = None
            player = None
            peer_connection = None
            try:
                runtime = await asyncio.get_event_loop().run_in_executor(
                    None,
                    self._runtime_factory.create_runtime,
                    session_id,
                    SessionOverrides(),
                )

                ice_server = RTCIceServer(urls="stun:stun.miwifi.com:3478")
                peer_connection = RTCPeerConnection(configuration=RTCConfiguration(iceServers=[ice_server]))
                player = HumanPlayer(runtime)
                context = SessionContext(
                    session_id=session_id,
                    runtime=runtime,
                    config=self._settings,
                    peer_connection=peer_connection,
                    player=player,
                )
                self._session_manager.add_context(context)

                self._configure_peer_connection(context)

                peer_connection.addTrack(player.audio)
                peer_connection.addTrack(player.video)
                self._prefer_video_codecs(peer_connection)

                await peer_connection.setRemoteDescription(offer)
                answer = await peer_connection.createAnswer()
                await peer_connection.setLocalDescription(answer)
            except Exception:
                await cleanup_partial_session(
                    self._session_manager,
                    session_id,
                    runtime=runtime,
                    player=player,
                    peer_connection=peer_connection,
                )
                raise

            return {
                "sdp": peer_connection.localDescription.sdp,
                "type": peer_connection.localDescription.type,
                "sessionid": session_id,
            }

    async def start_push_session(self, push_url: str, session_id: int) -> None:
        from aiortc import RTCPeerConnection, RTCSessionDescription
        from webrtc import HumanPlayer

        async with self._session_creation_lock:
            self._session_manager.reserve(session_id)
            runtime = None
            player = None
            peer_connection = None
            try:
                runtime = await asyncio.get_event_loop().run_in_executor(
                    None,
                    self._runtime_factory.create_runtime,
                    session_id,
                    SessionOverrides(),
                )

                peer_connection = RTCPeerConnection()
                player = HumanPlayer(runtime)
                context = SessionContext(
                    session_id=session_id,
                    runtime=runtime,
                    config=self._settings,
                    peer_connection=peer_connection,
                    player=player,
                )
                self._session_manager.add_context(context)
                self._configure_peer_connection(context)

                peer_connection.addTrack(player.audio)
                peer_connection.addTrack(player.video)

                await peer_connection.setLocalDescription(await peer_connection.createOffer())
                answer_sdp = await self._post(push_url, peer_connection.localDescription.sdp)
                await peer_connection.setRemoteDescription(RTCSessionDescription(sdp=answer_sdp, type="answer"))
            except Exception:
                await cleanup_partial_session(
                    self._session_manager,
                    session_id,
                    runtime=runtime,
                    player=player,
                    peer_connection=peer_connection,
                )
                raise

    async def close_all(self) -> None:
        await self._session_manager.close_all()

    def _allocate_session_id(self) -> int:
        while True:
            session_id = rand_n(6)
            if self._session_manager.get(session_id) is None:
                return session_id

    def _prefer_video_codecs(self, peer_connection: RTCPeerConnection) -> None:
        from aiortc.rtcrtpsender import RTCRtpSender

        capabilities = RTCRtpSender.getCapabilities("video")
        preferences = [codec for codec in capabilities.codecs if codec.name == "H264"]
        preferences += [codec for codec in capabilities.codecs if codec.name == "VP8"]
        preferences += [codec for codec in capabilities.codecs if codec.name == "rtx"]
        transceiver = peer_connection.getTransceivers()[1]
        transceiver.setCodecPreferences(preferences)

    def _configure_peer_connection(self, context: SessionContext) -> None:
        peer_connection = context.peer_connection
        session_id = context.session_id

        @peer_connection.on("connectionstatechange")
        async def on_connectionstatechange():
            logger.info("Connection state is %s", peer_connection.connectionState)
            if peer_connection.connectionState in {"failed", "closed"}:
                await self._session_manager.close_session(session_id)

    async def _post(self, url: str, data: str) -> str:
        import aiohttp

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, data=data) as response:
                    return await response.text()
        except aiohttp.ClientError as exc:
            logger.info("Error: %s", exc)
            raise
