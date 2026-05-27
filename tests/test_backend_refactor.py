import argparse
import unittest
from types import SimpleNamespace


class AppSettingsTests(unittest.TestCase):
    def test_build_session_options_creates_isolated_namespace(self):
        from backend.domain.settings import AppSettings

        namespace = argparse.Namespace(
            fps=50,
            batch_size=16,
            l=10,
            r=10,
            m=8,
            W=450,
            H=450,
            avatar_id="avatar_1",
            customvideo_config="",
            customopt=[{"audiotype": 2, "imgpath": "img-a", "audiopath": "audio-a"}],
            tts="edgetts",
            REF_FILE="voice-a",
            REF_TEXT="text",
            TTS_SERVER="http://127.0.0.1:9880",
            model="wav2lip",
            transport="webrtc",
            push_url="http://localhost/push",
            max_session=8,
            listenport=8010,
        )

        settings = AppSettings.from_namespace(namespace)
        options_a = settings.build_session_options(session_id=101)
        options_b = settings.build_session_options(session_id=202, voice_id="voice-b")

        self.assertEqual(options_a.sessionid, 101)
        self.assertEqual(options_a.REF_FILE, "voice-a")
        self.assertEqual(options_b.sessionid, 202)
        self.assertEqual(options_b.REF_FILE, "voice-b")
        self.assertEqual(settings.tts.ref_file, "voice-a")
        self.assertEqual(namespace.REF_FILE, "voice-a")

        options_a.customopt[0]["imgpath"] = "img-mutated"
        self.assertEqual(options_b.customopt[0]["imgpath"], "img-a")


class SessionManagerTests(unittest.IsolatedAsyncioTestCase):
    async def test_session_manager_tracks_context_and_closes_resources(self):
        from backend.application.session_manager import SessionContext, SessionManager

        events = []

        class FakeRuntime:
            def stop(self):
                events.append("runtime.stop")

        class FakePeerConnection:
            async def close(self):
                events.append("pc.close")

        context = SessionContext(
            session_id=123456,
            runtime=FakeRuntime(),
            config=SimpleNamespace(),
            peer_connection=FakePeerConnection(),
        )

        manager = SessionManager()
        manager.add_context(context)

        self.assertIs(manager.get_required(123456), context)

        await manager.close_session(123456)

        self.assertIsNone(manager.get(123456))
        self.assertEqual(events, ["runtime.stop", "pc.close"])

    async def test_session_reservation_counts_towards_capacity_until_released(self):
        from backend.application.session_manager import SessionManager
        from backend.domain.errors import MaxSessionReachedError

        manager = SessionManager(max_sessions=1)
        manager.reserve(100001)

        with self.assertRaises(MaxSessionReachedError):
            manager.ensure_capacity()

        manager.release_reservation(100001)
        manager.ensure_capacity()


class AvatarOrchestratorTests(unittest.IsolatedAsyncioTestCase):
    async def test_handle_human_request_applies_voice_override_without_mutating_base_config(self):
        from backend.application.orchestrator import AvatarOrchestrator
        from backend.application.session_manager import SessionContext
        from backend.domain.settings import SessionOverrides

        class FakeRuntime:
            def __init__(self):
                self.calls = []
                self.opt = SimpleNamespace(REF_FILE="voice-a")

            def flush_talk(self):
                self.calls.append(("flush_talk",))

            def put_msg_txt(self, text):
                self.calls.append(("put_msg_txt", text))

        runtime = FakeRuntime()
        context = SessionContext(
            session_id=7,
            runtime=runtime,
            config=SimpleNamespace(tts=SimpleNamespace(ref_file="voice-a")),
            overrides=SessionOverrides(),
        )

        orchestrator = AvatarOrchestrator()
        await orchestrator.handle_human_request(
            context,
            {
                "type": "echo",
                "text": "hello",
                "interrupt": True,
                "voice_id": "voice-b",
            },
        )

        self.assertEqual(runtime.calls, [("flush_talk",), ("put_msg_txt", "hello")])
        self.assertEqual(context.overrides.voice_id, "voice-b")
        self.assertEqual(runtime.opt.REF_FILE, "voice-b")
        self.assertEqual(context.config.tts.ref_file, "voice-a")


class CreateAppTests(unittest.TestCase):
    def test_create_app_registers_root_and_prefixed_routes(self):
        from backend.bootstrap.app_factory import create_app

        class FakeSessionService:
            async def create_offer_session(self, params):
                return {"sdp": "answer", "type": "answer", "sessionid": 1}

            async def close_all(self):
                return None

        class FakeOrchestrator:
            async def handle_human_request(self, context, params):
                return None

        class FakeSessionManager:
            def get_required(self, session_id):
                return SimpleNamespace(session_id=session_id, runtime=None, config=None, overrides=None)

        app = create_app(
            session_service=FakeSessionService(),
            orchestrator=FakeOrchestrator(),
            session_manager=FakeSessionManager(),
            static_path="web",
        )

        paths = sorted(
            route.resource.canonical
            for route in app.router.routes()
            if hasattr(route.resource, "canonical")
        )

        self.assertIn("/offer", paths)
        self.assertIn("/avatarhuman/offer", paths)
        self.assertIn("/human", paths)
        self.assertIn("/avatarhuman/human", paths)


class HandlerValidationTests(unittest.TestCase):
    def test_coerce_session_id_accepts_numeric_strings(self):
        from backend.api.handlers import coerce_session_id

        self.assertEqual(coerce_session_id({"sessionid": "123"}), 123)

    def test_coerce_session_id_requires_field(self):
        from aiohttp.web_exceptions import HTTPBadRequest
        from backend.api.handlers import coerce_session_id

        with self.assertRaises(HTTPBadRequest):
            coerce_session_id({})

    def test_coerce_session_id_rejects_invalid_value(self):
        from aiohttp.web_exceptions import HTTPBadRequest
        from backend.api.handlers import coerce_session_id

        with self.assertRaises(HTTPBadRequest):
            coerce_session_id({"sessionid": "abc"})

    def test_require_field_rejects_missing_values(self):
        from aiohttp.web_exceptions import HTTPBadRequest
        from backend.api.handlers import require_field

        with self.assertRaises(HTTPBadRequest):
            require_field({}, "file")


class SessionServiceCleanupTests(unittest.IsolatedAsyncioTestCase):
    async def test_cleanup_partial_session_releases_reserved_slot_and_resources(self):
        from backend.application.session_manager import SessionManager
        from backend.application.session_service import cleanup_partial_session

        events = []

        class FakeRuntime:
            def stop(self):
                events.append("runtime.stop")

        class FakePlayer:
            def close(self):
                events.append("player.close")

        class FakePeerConnection:
            async def close(self):
                events.append("pc.close")

        manager = SessionManager(max_sessions=1)
        manager.reserve(55)

        await cleanup_partial_session(
            manager,
            55,
            runtime=FakeRuntime(),
            player=FakePlayer(),
            peer_connection=FakePeerConnection(),
        )

        manager.ensure_capacity()
        self.assertEqual(events, ["runtime.stop", "player.close", "pc.close"])


class AvatarPathTests(unittest.TestCase):
    def test_avatar_assets_are_generated_under_runtime_data_root(self):
        from backend.domain.paths import build_avatar_path

        self.assertEqual(build_avatar_path("demo"), "data/avatars/demo")


if __name__ == "__main__":
    unittest.main()
