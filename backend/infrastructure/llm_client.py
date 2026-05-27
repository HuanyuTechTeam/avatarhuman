from __future__ import annotations

from llm import llm_response


class DashScopeLlmClient:
    def generate_reply(self, message: str, runtime) -> None:
        llm_response(message, runtime)
