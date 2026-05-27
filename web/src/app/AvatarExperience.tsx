import {useCallback} from "react";

import {AvatarStage} from "@/components/AvatarStage";
import {ChatPanel} from "@/components/ChatPanel";
import {PromptPanel} from "@/components/PromptPanel";
import {TextInputPanel} from "@/components/TextInputPanel";
import {TopBar} from "@/components/TopBar";
import {useAvatarSession} from "@/features/avatar/useAvatarSession";
import type {AvatarApi, Provider} from "@/types/avatar";

interface AvatarExperienceProps {
    api: AvatarApi;
    provider: Provider;
    title?: string;
    subtitle?: string;
    wakeWords: string[];
    voiceId: string;
    asrEndpoint: string;
    wakeResponseText: string;
    displayAiMessages: boolean;
    loadPrompts: () => Promise<string[]>;
}

export function AvatarExperience({
                                     api,
                                     provider,
                                     title,
                                     subtitle,
                                     wakeWords,
                                     voiceId,
                                     asrEndpoint,
                                     wakeResponseText,
                                     displayAiMessages,
                                     loadPrompts,
                                 }: AvatarExperienceProps) {
    const session = useAvatarSession({
        api,
        provider,
        wakeWords,
        voiceId,
        asrEndpoint,
        wakeResponseText,
        displayAiMessages,
        loadPrompts,
    });

    const selectPrompt = useCallback(
        async (prompt: string) => {
            session.closePrompts();
            await session.submitText(prompt);
        },
        [session],
    );

    return (
        <main className="app-shell">
            <TopBar
                title={title}
                subtitle={subtitle}
                dateText={session.clock.date}
                timeText={session.clock.time}
            />
            <ChatPanel messages={session.messages} showAiMessages={displayAiMessages}/>
            <AvatarStage
                audioRef={session.audioRef}
                videoRef={session.videoRef}
                isLoading={session.isLoading}
                isInteractionActive={session.isInteractionActive}
                onStart={session.startInteraction}
                onInterrupt={() => {
                    void session.interruptSpeech();
                }}
                onTogglePrompts={session.togglePrompts}
                onToggleInput={session.toggleInput}
                onEnd={() => {
                    void session.endInteraction();
                }}
            />
            <PromptPanel
                prompts={session.prompts}
                visible={session.showPrompts}
                onClose={session.closePrompts}
                onSelect={(prompt) => {
                    void selectPrompt(prompt);
                }}
            />
            <TextInputPanel
                value={session.inputValue}
                visible={session.showInput}
                onChange={session.setInputValue}
                onSend={() => session.sendInput()}
            />
            {session.errorMessage ? <div className="status-banner">{session.errorMessage}</div> : null}
        </main>
    );
}
