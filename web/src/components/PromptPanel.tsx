interface PromptPanelProps {
    prompts: string[];
    visible: boolean;
    onClose: () => void;
    onSelect: (prompt: string) => void;
}

export function PromptPanel({prompts, visible, onClose, onSelect}: PromptPanelProps) {
    if (!visible) {
        return null;
    }

    return (
        <section className="overlay-card">
            <div className="overlay-card__content">
                <button className="overlay-card__close" type="button" onClick={onClose}>
                    关闭
                </button>
                <h2 className="overlay-card__title">预设问题</h2>
                <div className="prompt-list">
                    {prompts.map((prompt) => (
                        <button
                            key={prompt}
                            className="prompt-list__item"
                            type="button"
                            onClick={() => onSelect(prompt)}
                        >
                            {prompt}
                        </button>
                    ))}
                </div>
            </div>
        </section>
    );
}
