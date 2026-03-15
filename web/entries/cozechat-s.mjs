import { createAvatarApi } from "../modules/core/avatar-api.mjs";
import { createAvatarPage } from "../modules/core/avatar-page.mjs";
import { loadJsonConfig } from "../modules/core/config-loader.mjs";
import { buildApiUrl, detectBackendPrefix } from "../modules/core/paths.mjs";
import { createCozeProvider } from "../modules/providers/index.mjs";

const backendPrefix = detectBackendPrefix(window.location.pathname);
const api = createAvatarApi({ prefix: backendPrefix });

const fallbackConfig = {
  wakeWords: ["小度小度。", "小度小度", "小杜小杜。", "小杜小杜"],
  cozeApi: {
    token: "",
    botId: "",
  },
  voice: {
    defaultVoiceId: "123.wav",
  },
};

const config = await loadJsonConfig(
  buildApiUrl(backendPrefix, "/cozechat-s-assets/config.json"),
  fallbackConfig,
);

const provider = createCozeProvider({
  token: config.cozeApi?.token ?? "",
  botId: config.cozeApi?.botId ?? "",
});

const page = createAvatarPage({
  api,
  provider,
  wakeWords: config.wakeWords ?? fallbackConfig.wakeWords,
  voiceId: config.voice?.defaultVoiceId ?? fallbackConfig.voice.defaultVoiceId,
  assetBasePath: buildApiUrl(backendPrefix, "/cozechat-s-assets"),
  asrEndpoint: config.asr?.endpoint ?? "/asr/api/v1/asr",
  wakeResponseText: config.wakeResponseText ?? "你好，我在",
  displayAiMessages: false,
});

window.PullFlowStop = () => page.stop();

await page.start();
