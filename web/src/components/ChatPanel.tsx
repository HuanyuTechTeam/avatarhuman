import type {ChatMessage} from "@/types/avatar";

interface ChatPanelProps {
    messages: ChatMessage[];
    showAiMessages: boolean;
}

export function ChatPanel({messages, showAiMessages}: ChatPanelProps) {
    const visibleMessages = messages.filter((message) => showAiMessages || message.role !== "ai");

    return (
        <section className="chat-panel">
            {visibleMessages.map((message) => (
                <div
                    key={message.id}
                    className={`chat-message chat-message--${message.role === "listening" ? "user" : message.role}`}
                >
                    <div className="chat-message__bubble">
                        {message.role === "listening" ? (
                            <span className="chat-message__status">{message.text}</span>
                        ) : (
                            message.text
                        )}
                    </div>
                </div>
            ))}
        </section>
    );
}
