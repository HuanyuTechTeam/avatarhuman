import {buildApiUrl} from "./paths";
import type {AvatarApi, HumanEchoPayload, OfferPayload, OfferResponse, SpeakingStateResponse,} from "@/types/avatar";

interface CreateAvatarApiOptions {
    prefix?: string;
    fetchImpl?: typeof fetch;
}

export function createAvatarApi({
                                    prefix = "",
                                    fetchImpl = fetch,
                                }: CreateAvatarApiOptions = {}): AvatarApi {
    async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
        const response = await fetchImpl(buildApiUrl(prefix, path), options);
        if (!response.ok) {
            throw new Error(`Request failed: ${path}`);
        }
        return (await response.json()) as T;
    }

    return {
        prefix,
        buildUrl(path: string) {
            return buildApiUrl(prefix, path);
        },
        async loadJsonAsset<T>(path: string) {
            return requestJson<T>(path, {method: "GET"});
        },
        async createOffer(offer: OfferPayload): Promise<OfferResponse> {
            return requestJson<OfferResponse>("/offer", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(offer),
            });
        },
        async sendHumanEcho({text, interrupt, sessionId, voiceId}: HumanEchoPayload) {
            return requestJson("/human", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    text,
                    type: "echo",
                    interrupt,
                    sessionid: sessionId,
                    voice_id: voiceId,
                }),
            });
        },
        async getSpeakingState(sessionId: number): Promise<SpeakingStateResponse> {
            return requestJson<SpeakingStateResponse>("/is_speaking", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({sessionid: sessionId}),
            });
        },
    };
}
