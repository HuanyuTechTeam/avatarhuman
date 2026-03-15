import { consumeSseJsonBuffer } from "../core/streaming.mjs";

export function createLangchainProvider({
  kbName,
  model,
  scoreThreshold,
  promptName,
  endpoint = "/llm/chat/kb_chat",
  fetchImpl = fetch,
}) {
  function buildChatRequest(text) {
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

  function parseChunk(chunk, buffer = "") {
    const result = consumeSseJsonBuffer(`${buffer}${chunk}`);
    const contents = result.messages
      .map((item) => item?.choices?.[0]?.delta?.content)
      .filter(Boolean);
    return {
      contents,
      remainder: result.remainder,
    };
  }

  async function streamReply(text, handlers = {}) {
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
    parseChunk(chunk) {
      return parseChunk(chunk).contents;
    },
    streamReply,
  };
}
