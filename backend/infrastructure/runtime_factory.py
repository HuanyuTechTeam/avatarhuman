from __future__ import annotations

from dataclasses import dataclass
from importlib import import_module

from backend.domain.settings import AppSettings, SessionOverrides


@dataclass(frozen=True)
class RuntimeAssets:
    model: object
    avatar: object


@dataclass(frozen=True)
class RuntimeSpec:
    module_name: str
    class_name: str
    load_model_name: str = "load_model"
    load_avatar_name: str = "load_avatar"
    warm_up_name: str = "warm_up"


RUNTIME_REGISTRY = {
    "wav2lip": RuntimeSpec("lipreal", "LipReal"),
    "musetalk": RuntimeSpec("musereal", "MuseReal"),
    "ultralight": RuntimeSpec("lightreal", "LightReal"),
}


class RuntimeFactory:
    def __init__(self, settings: AppSettings):
        self._settings = settings
        self._assets: RuntimeAssets | None = None

    @property
    def settings(self) -> AppSettings:
        return self._settings

    def load_runtime_assets(self) -> RuntimeAssets:
        spec = self._get_spec()
        module = import_module(spec.module_name)
        load_model = getattr(module, spec.load_model_name)
        load_avatar = getattr(module, spec.load_avatar_name)
        warm_up = getattr(module, spec.warm_up_name)

        model_name = self._settings.model.name
        avatar_id = self._settings.model.avatar_id
        batch_size = self._settings.runtime.batch_size

        if model_name == "musetalk":
            model = load_model()
            avatar = load_avatar(avatar_id)
            warm_up(batch_size, model)
        elif model_name == "wav2lip":
            model = load_model("./models/wav2lip.pth")
            avatar = load_avatar(avatar_id)
            warm_up(batch_size, model, 256)
        elif model_name == "ultralight":
            model = load_model(self._settings.build_session_options(session_id=0))
            avatar = load_avatar(avatar_id)
            warm_up(batch_size, avatar, 160)
        else:
            raise ValueError(f"unsupported model: {model_name}")

        self._assets = RuntimeAssets(model=model, avatar=avatar)
        return self._assets

    def create_runtime(self, session_id: int, overrides: SessionOverrides | None = None):
        if self._assets is None:
            self.load_runtime_assets()

        spec = self._get_spec()
        module = import_module(spec.module_name)
        runtime_class = getattr(module, spec.class_name)
        voice_id = overrides.voice_id if overrides else None
        options = self._settings.build_session_options(session_id=session_id, voice_id=voice_id)
        return runtime_class(options, self._assets.model, self._assets.avatar)

    def _get_spec(self) -> RuntimeSpec:
        try:
            return RUNTIME_REGISTRY[self._settings.model.name]
        except KeyError as exc:
            raise ValueError(f"unsupported model: {self._settings.model.name}") from exc
