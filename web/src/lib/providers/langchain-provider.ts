import { consumeSseJsonBuffer } from "@/lib/core/streaming";
import type { Provider, ProviderParseResult, StreamReplyHandlers } from "@/types/avatar";

interface CreateLangchainProviderOptions {
  kbName: string;
  model: string;
  scoreThreshold: number;
  promptName: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

interface LangchainDeltaMessage {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
}

export function createLangchainProvider({
  kbName,
  model,
  scoreThreshold,
  promptName,
  endpoint = "/llm/chat/kb_chat",
  fetchImpl = fetch,
}: CreateLangchainProviderOptions): Provider & {
  buildChatRequest(text: string): { url: string; headers: HeadersInit; body: Record<string, unknown> };
  parseChunk(chunk: string, buffer?: string): ProviderParseResult;
} {
  function buildChatRequest(text: string) {
    return {
      url: endpoint,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: {
        query: text,
        mode: "local_kb",
        kb_name: kbName,
        top_k: 3,
        score_threshold: scoreThreshold,
        history: [
          {
            content: "你是一个客服，请回答用户问题",
            role: "user",
          },
          {
            content: "明白了",
            role: "assistant",
          },
        ],
        stream: true,
        model,
        temperature: 0.5,
        max_tokens: 0,
        prompt_name: promptName,
        return_direct: false,
      },
    };
  }

  function parseChunk(chunk: string, buffer = ""): ProviderParseResult {
    const result = consumeSseJsonBuffer(`${buffer}${chunk}`);
    const contents = (result.messages as LangchainDeltaMessage[])
      .map((item) => item?.choices?.[0]?.delta?.content)
      .filter((value): value is string => Boolean(value));

    return {
      contents,
      remainder: result.remainder,
    };
  }

  async function streamReply(text: string, handlers: StreamReplyHandlers = {}): Promise<void> {
    const { onText = () => {}, onComplete = () => {}, onError = () => {}, signal } = handlers;

    try {
      const request = buildChatRequest(text);
      const response = await fetchImpl(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(request.body),
        signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("Langchain reply request failed");
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

        const textChunk = decoder.decode(value, { stream: true });
        const parsed = parseChunk(textChunk, buffer);
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
    kind: "langchain",
    buildChatRequest,
    parseChunk,
    streamReply,
  };
}
