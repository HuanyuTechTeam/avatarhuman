import type {RefObject} from "react";

interface AvatarStageProps {
    audioRef: RefObject<HTMLAudioElement | null>;
    videoRef: RefObject<HTMLVideoElement | null>;
    isLoading: boolean;
    isInteractionActive: boolean;
    onStart: () => void;
    onInterrupt: () => void;
    onTogglePrompts: () => void;
    onToggleInput: () => void;
    onEnd: () => void;
}

export function AvatarStage({
                                audioRef,
                                videoRef,
                                isLoading,
                                isInteractionActive,
                                onStart,
                                onInterrupt,
                                onTogglePrompts,
                                onToggleInput,
                                onEnd,
                            }: AvatarStageProps) {
    return (
        <section className="avatar-stage">
            <audio ref={audioRef} autoPlay/>
            <div className="avatar-stage__viewport">
                <video ref={videoRef} className="avatar-stage__video" muted autoPlay playsInline/>
            </div>
            {isLoading ? (
                <div className="avatar-stage__loading">
                    <div className="avatar-stage__spinner"/>
                    <div>系统初始化</div>
                </div>
            ) : null}
            {!isLoading && !isInteractionActive ? (
                <button className="avatar-stage__start" type="button" onClick={onStart}>
                    点击开始对话
                </button>
            ) : null}
            {isInteractionActive ? (
                <div className="avatar-stage__actions">
                    <button type="button" onClick={onInterrupt}>
                        打断
                    </button>
                    <button type="button" onClick={onTogglePrompts}>
                        预设
                    </button>
                    <button type="button" onClick={onToggleInput}>
                        输入
                    </button>
                    <button type="button" onClick={onEnd}>
                        结束
                    </button>
                </div>
            ) : null}
        </section>
    );
}
