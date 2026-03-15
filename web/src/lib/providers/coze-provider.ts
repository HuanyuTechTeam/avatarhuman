import { consumeSseJsonBuffer } from "@/lib/core/streaming";
import type { Provider, ProviderParseResult, StreamReplyHandlers } from "@/types/avatar";

interface CreateCozeProviderOptions {
  endpoint: string;
  fetchImpl?: typeof fetch;
}

interface CozeDeltaMessage {
  type?: string;
  content?: string;
}

export function createCozeProvider({
  endpoint,
  fetchImpl = fetch,
}: CreateCozeProviderOptions): Provider & {
  getConversationId(): string;
  parseChunk(chunk: string, buffer?: string): ProviderParseResult;
} {
  let conversationId = "";

  async function ensureConversation(): Promise<string> {
    if (conversationId) {
      return conversationId;
    }

    const response = await fetchImpl(`${endpoint}/conversation/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error("Coze conversation create failed");
    }

    const payload = (await response.json()) as { data?: { id?: string } };
    conversationId = payload?.data?.id ?? "";
    if (!conversationId) {
      throw new Error("Coze conversation id missing");
    }
    return conversationId;
  }

  function parseChunk(chunk: string, buffer = ""): ProviderParseResult {
    const result = consumeSseJsonBuffer(`${buffer}${chunk}`, "conversation.message.delta");
    const contents = (result.messages as CozeDeltaMessage[])
      .filter((item) => item.type === "answer" && item.content)
      .map((item) => item.content as string);

    return {
      contents,
      remainder: result.remainder,
    };
  }

  async function streamReply(text: string, handlers: StreamReplyHandlers = {}): Promise<void> {
    const { onText = () => {}, onComplete = () => {}, onError = () => {}, signal } = handlers;

    try {
      const currentConversationId = await ensureConversation();
      const response = await fetchImpl(`${endpoint}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          conversationId: currentConversationId,
        }),
        signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("Coze reply request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        if (signal?.aborted) {
          return;
        }

        const { done, value } = await reader.read();
        if (done) {
          await Promise.resolve(onComplete());
          return;
        }

        const chunkText = decoder.decode(value, { stream: true });
        const parsed = parseChunk(chunkText, buffer);
        buffer = parsed.remainder;

        for (const content of parsed.contents) {
          if (signal?.aborted) {
            return;
          }
          await Promise.resolve(onText(content));
        }
      }
    } catch (error) {
      if (signal?.aborted) {
        return;
      }
      await Promise.resolve(onError(error));
    }
  }

  return {
    kind: "coze",
    getConversationId() {
      return conversationId;
    },
    parseChunk,
    resetConversation() {
      conversationId = "";
    },
    streamReply,
  };
}
