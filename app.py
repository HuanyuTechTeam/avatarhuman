import asyncio
from pathlib import Path

import torch.multiprocessing as mp
from aiohttp import web

from backend.application.orchestrator import AvatarOrchestrator
from backend.application.session_manager import SessionManager
from backend.application.session_service import SessionService
from backend.bootstrap.app_factory import create_app
from backend.bootstrap.cli import parse_args
from backend.bootstrap.env import load_env_file
from backend.domain.settings import AppSettings
from backend.infrastructure.llm_client import DashScopeLlmClient
from backend.infrastructure.runtime_factory import RuntimeFactory
from logger import logger


def load_runtime_assets(runtime_factory: RuntimeFactory):
    return runtime_factory.load_runtime_assets()


def build_services(settings: AppSettings):
    session_manager = SessionManager(max_sessions=settings.runtime.max_session)
    runtime_factory = RuntimeFactory(settings)
    load_runtime_assets(runtime_factory)
    orchestrator = AvatarOrchestrator(llm_client=DashScopeLlmClient())
    session_service = SessionService(settings, session_manager, runtime_factory)
    return session_manager, orchestrator, session_service


def create_application(settings: AppSettings) -> tuple[web.Application, SessionService]:
    session_manager, orchestrator, session_service = build_services(settings)
    static_root = Path(settings.static_root)
    dist_root = static_root / "dist"
    application = create_app(
        session_service=session_service,
        orchestrator=orchestrator,
        session_manager=session_manager,
        static_path=str(dist_root if dist_root.exists() else static_root),
        api_prefixes=settings.api_prefixes,
        static_aliases=settings.static_aliases,
    )
    return application, session_service


def serve(application: web.Application, session_service: SessionService, settings: AppSettings) -> None:
    runner = web.AppRunner(application)
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(runner.setup())
    site = web.TCPSite(runner, "0.0.0.0", settings.transport.listen_port)
    loop.run_until_complete(site.start())

    if settings.transport.mode == "rtcpush":
        for index in range(settings.runtime.max_session):
            push_url = settings.transport.push_url if index == 0 else f"{settings.transport.push_url}{index}"
            loop.run_until_complete(session_service.start_push_session(push_url, index))

    logger.info("数字人启动完成，请使用游览器访问ip+端口+web页面")
    loop.run_forever()


def main() -> None:
    try:
        mp.set_start_method("spawn")
    except RuntimeError:
        pass

    load_env_file()
    args = parse_args()
    logger.info(args)
    settings = AppSettings.from_namespace(args)
    application, session_service = create_application(settings)
    serve(application, session_service, settings)


if __name__ == "__main__":
    main()
