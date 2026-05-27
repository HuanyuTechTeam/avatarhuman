import {splitTextByPunctuation} from "@/lib/core/streaming";
import type {AvatarApi, Provider} from "@/types/avatar";

interface CreateConversationControllerOptions {
    api: AvatarApi;
    provider: Provider;
    voiceId: string;
    getSessionId: () => number | null;
    onAiTextStart: () => void;
    onAiTextUpdate: (text: string) => void;
    onAiTextFinish: () => void;
}

export function createConversationController({
                                                 api,
                                                 provider,
                                                 voiceId,
                                                 getSessionId,
                                                 onAiTextStart,
                                                 onAiTextUpdate,
                                                 onAiTextFinish,
                                             }: CreateConversationControllerOptions) {
    let aiFullText = "";
    let aiSentenceRemainder = "";
    let activeStreamToken = 0;
    let activeStreamController: AbortController | null = null;
    let speechQueue = Promise.resolve();

    async function dispatchAvatarText(text: string, interrupt = false, streamToken = activeStreamToken) {
        const sessionId = getSessionId();
        if (!text || sessionId === null || streamToken !== activeStreamToken) {
            return;
        }

        speechQueue = speechQueue
            .catch(() => {
            })
            .then(() => {
                const currentSessionId = getSessionId();
                if (streamToken !== activeStreamToken || currentSessionId === null) {
                    return;
                }

                return api.sendHumanEcho({
                    text,
                    interrupt,
                    sessionId: currentSessionId,
                    voiceId,
                });
            });

        await speechQueue;
    }

    function resetAiStreamState() {
        aiFullText = "";
        aiSentenceRemainder = "";
        onAiTextFinish();
    }

    function resetConversationState() {
        provider.resetConversation?.();
    }

    function cancelActiveStream() {
        activeStreamController?.abort();
        activeStreamController = null;
        activeStreamToken += 1;
        speechQueue = Promise.resolve();
        resetAiStreamState();
    }

    async function handleAiChunk(chunk: string, streamToken: number) {
        if (streamToken !== activeStreamToken) {
            return;
        }

        aiFullText += chunk;
        onAiTextUpdate(aiFullText);

        const parsed = splitTextByPunctuation(chunk, aiSentenceRemainder);
        aiSentenceRemainder = parsed.remainder;

        for (const sentence of parsed.sentences) {
            await dispatchAvatarText(sentence, false, streamToken);
        }
    }

    async function finalizeAiStream(streamToken: number) {
        if (streamToken !== activeStreamToken) {
            return;
        }

        if (aiSentenceRemainder.trim()) {
            await dispatchAvatarText(aiSentenceRemainder, false, streamToken);
        }

        aiSentenceRemainder = "";
        onAiTextFinish();
    }

    async function submitText(text: string) {
        if (!text.trim()) {
            return;
        }

        cancelActiveStream();
        onAiTextStart();

        const streamToken = activeStreamToken;
        activeStreamController = new AbortController();

        await provider.streamReply(text, {
            onText: (chunk) => handleAiChunk(chunk, streamToken),
            onComplete: () => finalizeAiStream(streamToken),
            onError: (error) => {
                if (streamToken !== activeStreamToken) {
                    return;
                }
                console.error(error);
                onAiTextFinish();
            },
            signal: activeStreamController.signal,
        });

        if (streamToken === activeStreamToken) {
            activeStreamController = null;
        }
    }

    return {
        cancelActiveStream,
        dispatchAvatarText,
        resetConversationState,
        submitText,
    };
}
