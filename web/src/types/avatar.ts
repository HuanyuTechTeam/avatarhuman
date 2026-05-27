export type ChatRole = "user" | "ai" | "listening";

export interface ChatMessage {
    id: string;
    role: ChatRole;
    text: string;
}

export interface OfferPayload {
    sdp: string;
    type: RTCSdpType;
}

export interface OfferResponse {
    sdp: string;
    type: RTCSdpType;
    sessionid: number;
}

export interface SpeakingStateResponse {
    code: number;
    data: boolean;
    msg?: string;
}

export interface HumanEchoPayload {
    text: string;
    interrupt: boolean;
    sessionId: number;
    voiceId: string;
}

export interface AvatarApi {
    prefix: string;

    buildUrl(path: string): string;

    loadJsonAsset<T>(path: string): Promise<T>;

    createOffer(offer: OfferPayload): Promise<OfferResponse>;

    sendHumanEcho(payload: HumanEchoPayload): Promise<unknown>;

    getSpeakingState(sessionId: number): Promise<SpeakingStateResponse>;
}

export interface StreamReplyHandlers {
    onText?: (chunk: string) => Promise<void> | void;
    onComplete?: () => Promise<void> | void;
    onError?: (error: unknown) => Promise<void> | void;
    signal?: AbortSignal;
}

export interface ProviderParseResult {
    contents: string[];
    remainder: string;
}

export interface Provider {
    kind: "coze" | "langchain";

    streamReply(text: string, handlers?: StreamReplyHandlers): Promise<void>;

    resetConversation?(): void;
}

export interface AppConfig {
    wakeWords: string[];
    voice: {
        defaultVoiceId: string;
    };
    asr?: {
        endpoint?: string;
    };
    wakeResponseText?: string;
}

export interface CozeConfig extends AppConfig {
    cozeApi?: {
        endpoint?: string;
    };
}

export interface LangchainConfig extends AppConfig {
    langchain?: {
        kb_name?: string;
        model?: string;
        score_threshold?: number;
        prompt_name?: string;
        endpoint?: string;
    };
}

export interface PromptConfig {
    prompt: string[];
}

export interface AsrResponse {
    result?: Array<{
        clean_text?: string;
    }>;
}
