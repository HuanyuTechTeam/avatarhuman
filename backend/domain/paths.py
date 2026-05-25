from __future__ import annotations

import os

AVATAR_ROOT = os.path.join("data", "avatars")


def build_avatar_path(avatar_id: str) -> str:
    return os.path.join(AVATAR_ROOT, avatar_id).replace("\\", "/")
