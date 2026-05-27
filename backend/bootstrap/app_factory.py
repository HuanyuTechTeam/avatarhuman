from __future__ import annotations

from aiohttp import web

from backend.api.handlers import create_handler_bundle, register_routes

try:
    import aiohttp_cors
except ModuleNotFoundError:  # pragma: no cover - optional dependency in tests.
    aiohttp_cors = None


def create_app(
        session_service,
        orchestrator,
        session_manager,
        static_path: str,
        api_prefixes=("", "/avatarhuman"),
        static_aliases=("/", "/avatarhuman/"),
) -> web.Application:
    app = web.Application(client_max_size=1024 ** 2 * 100)
    app.on_shutdown.append(lambda _app: session_service.close_all())

    handlers = create_handler_bundle(session_service, orchestrator, session_manager)
    register_routes(app, handlers, prefixes=tuple(api_prefixes))
    for static_alias in static_aliases:
        app.router.add_static(static_alias, path=static_path)

    if aiohttp_cors is not None:
        cors = aiohttp_cors.setup(
            app,
            defaults={
                "*": aiohttp_cors.ResourceOptions(
                    allow_credentials=True,
                    expose_headers="*",
                    allow_headers="*",
                )
            },
        )
        for route in list(app.router.routes()):
            cors.add(route)

    return app
