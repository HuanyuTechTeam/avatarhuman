from __future__ import annotations

from ttsreal import (
    CosyVoiceTTS,
    EdgeTTS,
    FishTTS,
    SovitsTTS,
    TencentTTS,
    XTTS,
    indexTTS,
)

TTS_REGISTRY = {
    "edgetts": EdgeTTS,
    "gpt-sovits": SovitsTTS,
    "xtts": XTTS,
    "cosyvoice": CosyVoiceTTS,
    "fishtts": FishTTS,
    "tencent": TencentTTS,
    "index_tts": indexTTS,
}


def create_tts_from_options(opt, parent):
    provider = getattr(opt, "tts", None)
    try:
        tts_class = TTS_REGISTRY[provider]
    except KeyError as exc:
        raise ValueError(f"unsupported tts provider: {provider}") from exc
    return tts_class(opt, parent)
