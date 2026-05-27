from __future__ import annotations

import argparse
import json
import os


def env_str(name: str, default: str) -> str:
    return os.getenv(name, default)


def env_int(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None or raw_value == "":
        return default
    try:
        return int(raw_value)
    except ValueError:
        return default


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fps", type=int, default=env_int("AVATARHUMAN_FPS", 50), help="audio fps,must be 50")
    parser.add_argument("-l", type=int, default=env_int("AVATARHUMAN_STRIDE_LEFT", 10))
    parser.add_argument("-m", type=int, default=env_int("AVATARHUMAN_STRIDE_MIDDLE", 8))
    parser.add_argument("-r", type=int, default=env_int("AVATARHUMAN_STRIDE_RIGHT", 10))
    parser.add_argument("--W", type=int, default=env_int("AVATARHUMAN_WIDTH", 450), help="GUI width")
    parser.add_argument("--H", type=int, default=env_int("AVATARHUMAN_HEIGHT", 450), help="GUI height")
    parser.add_argument(
        "--avatar_id",
        type=str,
        default=env_str("AVATARHUMAN_AVATAR_ID", "avator_1"),
        help="define which avatar in data/avatars",
    )
    parser.add_argument("--batch_size", type=int, default=env_int("AVATARHUMAN_BATCH_SIZE", 16), help="infer batch")
    parser.add_argument(
        "--customvideo_config",
        type=str,
        default=env_str("AVATARHUMAN_CUSTOM_VIDEO_CONFIG", ""),
        help="custom action json",
    )
    parser.add_argument("--tts", type=str, default=env_str("AVATARHUMAN_TTS", "edgetts"), help="tts service type")
    parser.add_argument("--REF_FILE", type=str, default=env_str("AVATARHUMAN_REF_FILE", "zh-CN-YunxiaNeural"))
    parser.add_argument(
        "--REF_TEXT",
        type=str,
        default=env_str("AVATARHUMAN_REF_TEXT", "当归性温味甘，补血活血，常用于妇科疾病"),
    )
    parser.add_argument("--TTS_SERVER", type=str, default=env_str("AVATARHUMAN_TTS_SERVER", "http://127.0.0.1:9880"))
    parser.add_argument("--model", type=str, default=env_str("AVATARHUMAN_MODEL", "wav2lip"))
    parser.add_argument("--transport", type=str, default=env_str("AVATARHUMAN_TRANSPORT", "webrtc"))
    parser.add_argument(
        "--push_url",
        type=str,
        default=env_str("AVATARHUMAN_PUSH_URL", "http://localhost:1985/rtc/v1/whip/?app=live&stream=livestream"),
    )
    parser.add_argument("--max_session", type=int, default=env_int("AVATARHUMAN_MAX_SESSION", 8))
    parser.add_argument(
        "--listenport",
        type=int,
        default=env_int("AVATARHUMAN_LISTEN_PORT", 8010),
        help="web listen port",
    )
    return parser


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = build_argument_parser()
    args = parser.parse_args(argv)
    args.customopt = []
    if args.customvideo_config:
        with open(args.customvideo_config, "r", encoding="utf-8") as file:
            args.customopt = json.load(file)
    return args
