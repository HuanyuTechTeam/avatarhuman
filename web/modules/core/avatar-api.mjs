import { buildApiUrl } from "./paths.mjs";

export function createAvatarApi({ prefix = "", fetchImpl = fetch } = {}) {
  async function requestJson(path, options = {}) {
    const response = await fetchImpl(buildApiUrl(prefix, path), options);
    if (!response.ok) {
      throw new Error(`Request failed: ${path}`);
    }
    return response.json();
  }

  return {
    prefix,
    buildUrl(path) {
      return buildApiUrl(prefix, path);
    },
    async loadJsonAsset(path) {
      return requestJson(path, { method: "GET" });
    },
    async createOffer(offer) {
      return requestJson("/offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(offer),
      });
    },
    async sendHumanEcho({ text, interrupt, sessionId, voiceId }) {
      return requestJson("/human", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          type: "echo",
          interrupt,
          sessionid: sessionId,
          voice_id: voiceId,
        }),
      });
    },
    async getSpeakingState(sessionId) {
      return requestJson("/is_speaking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionid: sessionId }),
      });
    },
  };
}
