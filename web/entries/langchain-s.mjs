import { createAvatarApi } from "../modules/core/avatar-api.mjs";
import { createAvatarPage } from "../modules/core/avatar-page.mjs";
import { loadJsonConfig } from "../modules/core/config-loader.mjs";
import { buildApiUrl, detectBackendPrefix } from "../modules/core/paths.mjs";
import { createLangchainProvider } from "../modules/providers/index.mjs";

const backendPrefix = detectBackendPrefix(window.location.pathname);
const api = createAvatarApi({ prefix: backendPrefix });

const fallbackConfig = {
  wakeWords: ["小度小度。", "小度小度", "小杜小杜。", "小杜小杜"],
  langchain: {
    kb_name: "test",
    model: "qwen2.5-instruct",
    score_threshold: 0.6,
    prompt_name: "default",
  },
  voice: {
    defaultVoiceId: "model_man_oldman01.wav",
  },
};

const config = await loadJsonConfig(
  buildApiUrl(backendPrefix, "/langchain-s-assets/config.json"),
  fallbackConfig,
);

const provider = createLangchainProvider({
  kbName: config.langchain?.kb_name ?? fallbackConfig.langchain.kb_name,
  model: config.langchain?.model ?? fallbackConfig.langchain.model,
  scoreThreshold: config.langchain?.score_threshold ?? fallbackConfig.langchain.score_threshold,
  promptName: config.langchain?.prompt_name ?? fallbackConfig.langchain.prompt_name,
  endpoint: config.langchain?.endpoint ?? "/llm/chat/kb_chat",
});

const page = createAvatarPage({
  api,
  provider,
  wakeWords: config.wakeWords ?? fallbackConfig.wakeWords,
  voiceId: config.voice?.defaultVoiceId ?? fallbackConfig.voice.defaultVoiceId,
  assetBasePath: buildApiUrl(backendPrefix, "/langchain-s-assets"),
  asrEndpoint: config.asr?.endpoint ?? "/asr/api/v1/asr",
  wakeResponseText: config.wakeResponseText ?? "您好，我在",
  displayAiMessages: true,
});

window.PullFlowStop = () => page.stop();

await page.start();
