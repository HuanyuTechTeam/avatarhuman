import {useEffect, useMemo, useState} from "react";

import {AvatarExperience} from "@/app/AvatarExperience";
import {createAvatarApi} from "@/lib/core/avatar-api";
import {loadJsonConfig} from "@/lib/core/config-loader";
import {buildApiUrl, detectBackendPrefix} from "@/lib/core/paths";
import {createLangchainProvider} from "@/lib/providers";
import type {LangchainConfig, PromptConfig} from "@/types/avatar";

const fallbackConfig: LangchainConfig = {
    wakeWords: ["小度小度。", "小度小度", "小杜小杜。", "小杜小杜"],
    langchain: {
        kb_name: "test",
        model: "qwen2.5-instruct",
        score_threshold: 0.6,
        prompt_name: "default",
        endpoint: "/llm/chat/kb_chat",
    },
    voice: {
        defaultVoiceId: "model_man_oldman01.wav",
    },
    wakeResponseText: "您好，我在",
    asr: {
        endpoint: "/asr/api/v1/asr",
    },
};

const langchainConfigPath = import.meta.env.VITE_LANGCHAIN_CONFIG_PATH || "/config/langchain.json";
const promptPath = import.meta.env.VITE_PROMPT_PATH || "/prompt.json";

export function LangchainPage() {
    const backendPrefix = useMemo(() => detectBackendPrefix(window.location.pathname), []);
    const api = useMemo(() => createAvatarApi({prefix: backendPrefix}), [backendPrefix]);
    const [config, setConfig] = useState<LangchainConfig | null>(null);

    useEffect(() => {
        void loadJsonConfig<LangchainConfig>(buildApiUrl(backendPrefix, langchainConfigPath), fallbackConfig).then(
            setConfig,
        );
    }, [backendPrefix]);

    const provider = useMemo(() => {
        if (!config) {
            return null;
        }

        return createLangchainProvider({
            kbName: config.langchain?.kb_name ?? fallbackConfig.langchain?.kb_name ?? "test",
            model: config.langchain?.model ?? fallbackConfig.langchain?.model ?? "qwen2.5-instruct",
            scoreThreshold:
                config.langchain?.score_threshold ?? fallbackConfig.langchain?.score_threshold ?? 0.6,
            promptName: config.langchain?.prompt_name ?? fallbackConfig.langchain?.prompt_name ?? "default",
            endpoint: buildApiUrl(
                backendPrefix,
                config.langchain?.endpoint ?? fallbackConfig.langchain?.endpoint ?? "/llm/chat/kb_chat",
            ),
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
            displayAiMessages
            loadPrompts={async () => {
                const payload = await api.loadJsonAsset<PromptConfig>(promptPath);
                return payload.prompt ?? [];
            }}
        />
    );
}
