import { useEffect, useMemo, useState } from "react";

import { AvatarExperience } from "@/app/AvatarExperience";
import { createAvatarApi } from "@/lib/core/avatar-api";
import { loadJsonConfig } from "@/lib/core/config-loader";
import { buildApiUrl, detectBackendPrefix } from "@/lib/core/paths";
import { createCozeProvider } from "@/lib/providers";
import type { CozeConfig, PromptConfig } from "@/types/avatar";

const fallbackConfig: CozeConfig = {
  wakeWords: ["小度小度。", "小度小度", "小杜小杜。", "小杜小杜"],
  cozeApi: {
    endpoint: "/coze",
  },
  voice: {
    defaultVoiceId: "123.wav",
  },
  wakeResponseText: "你好，我在",
  asr: {
    endpoint: "/asr/api/v1/asr",
  },
};

const cozeConfigPath = import.meta.env.VITE_COZE_CONFIG_PATH || "/config/cozechat.json";
const promptPath = import.meta.env.VITE_PROMPT_PATH || "/prompt.json";

export function CozeChatPage() {
  const backendPrefix = useMemo(() => detectBackendPrefix(window.location.pathname), []);
  const api = useMemo(() => createAvatarApi({ prefix: backendPrefix }), [backendPrefix]);
  const [config, setConfig] = useState<CozeConfig | null>(null);

  useEffect(() => {
    void loadJsonConfig<CozeConfig>(buildApiUrl(backendPrefix, cozeConfigPath), fallbackConfig).then(setConfig);
  }, [backendPrefix]);

  const provider = useMemo(() => {
    if (!config) {
      return null;
    }
    return createCozeProvider({
      endpoint: buildApiUrl(backendPrefix, config.cozeApi?.endpoint ?? "/coze"),
    });
  }, [backendPrefix, config]);

  if (!config || !provider) {
    return <div className="app-loading">加载配置中...</div>;
  }

  return (
    <AvatarExperience
      api={api}
      provider={provider}
      wakeWords={config.wakeWords ?? fallbackConfig.wakeWords}
      voiceId={config.voice.defaultVoiceId}
      asrEndpoint={config.asr?.endpoint ?? fallbackConfig.asr?.endpoint ?? "/asr/api/v1/asr"}
      wakeResponseText={config.wakeResponseText ?? fallbackConfig.wakeResponseText ?? ""}
      displayAiMessages={false}
      loadPrompts={async () => {
        const payload = await api.loadJsonAsset<PromptConfig>(promptPath);
        return payload.prompt ?? [];
      }}
    />
  );
}
