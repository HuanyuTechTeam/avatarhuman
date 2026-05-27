const SENTENCE_PUNCTUATION = /[。！？!?；;，,]/;

export function readJsonAssetFromText<T>(text: string): T {
    return JSON.parse(text) as T;
}

export function consumeSseJsonBuffer(
    buffer: string,
    eventName: string | null = null,
): { messages: unknown[]; remainder: string } {
    const normalized = buffer.replace(/\r\n/g, "\n");
    const blocks = normalized.split("\n\n");
    const hasCompleteTerminator = normalized.endsWith("\n\n");
    const remainder = hasCompleteTerminator ? "" : (blocks.pop() ?? "");
    const messages: unknown[] = [];

    for (const block of blocks) {
        if (!block.trim()) {
            continue;
        }

        let blockEventName: string | null = null;
        const dataLines: string[] = [];

        for (const line of block.split("\n")) {
            if (line.startsWith("event:")) {
                blockEventName = line.slice("event:".length).trim();
            } else if (line.startsWith("data:")) {
                dataLines.push(line.slice("data:".length).trim());
            }
        }

        if (eventName && blockEventName !== eventName) {
            continue;
        }

        for (const line of dataLines) {
            if (!line || line === "[DONE]") {
                continue;
            }
            try {
                messages.push(JSON.parse(line));
            } catch (_error) {
                // Keep the parser permissive for mixed event streams.
            }
        }
    }

    return {messages, remainder};
}

export function extractSseJsonMessages<T>(buffer: string, eventName: string | null = null): T[] {
    return consumeSseJsonBuffer(`${buffer}\n\n`, eventName).messages as T[];
}

export function splitTextByPunctuation(
    text: string,
    remainder = "",
): { sentences: string[]; remainder: string } {
    const combined = `${remainder}${text}`;
    const sentences: string[] = [];
    let cursor = "";

    for (const char of combined) {
        cursor += char;
        if (SENTENCE_PUNCTUATION.test(char)) {
            sentences.push(cursor);
            cursor = "";
        }
    }

    return {
        sentences,
        remainder: cursor,
    };
}
