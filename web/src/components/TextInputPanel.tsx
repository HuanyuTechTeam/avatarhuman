interface TextInputPanelProps {
    value: string;
    visible: boolean;
    onChange: (value: string) => void;
    onSend: () => void;
}

export function TextInputPanel({value, visible, onChange, onSend}: TextInputPanelProps) {
    if (!visible) {
        return null;
    }

    return (
        <section className="input-panel">
            <div className="input-panel__content">
                <input
                    className="input-panel__field"
                    type="text"
                    value={value}
                    autoComplete="off"
                    placeholder="请输入问题"
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            void onSend();
                        }
                    }}
                />
                <button className="input-panel__send" type="button" onClick={onSend}>
                    发送
                </button>
            </div>
        </section>
    );
}
