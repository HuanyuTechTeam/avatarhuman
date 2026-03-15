import { consumeSseJsonBuffer } from "../core/streaming.mjs";

export function createCozeProvider({ token, botId, fetchImpl = fetch }) {
  let conversationId = "";

  async function ensureConversation() {
    if (conversationId) {
      return conversationId;
    }

    const response = await fetchImpl("https://api.coze.cn/v1/conversation/create", {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ bot_id: botId }),
    });

    if (!response.ok) {
      throw new Error("Coze conversation create failed");
    }

    const payload = await response.json();
    conversationId = payload?.data?.id ?? "";
    if (!conversationId) {
      throw new Error("Coze conversation id missing");
    }
    return conversationId;
  }

  function buildChatRequest(text) {
    return {
      url: conversationId
        ? `https://api.coze.cn/v3/chat?conversation_id=${conversationId}`
        : "https://api.coze.cn/v3/chat",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: {
        bot_id: botId,
        user_id: "1",
        stream: true,
        auto_save_history: true,
        additional_messages: [
          {
            role: "user",
            content: text,
            content_type: "text",
          },
        ],
      },
    };
  }

  function parseChunk(chunk, buffer = "") {
    const result = consumeSseJsonBuffer(`${buffer}${chunk}`, "conversation.message.delta");
    return {
      contents: result.messages
        .filter((item) => item.type === "answer" && item.content)
        .map((item) => item.content),
      remainder: result.remainder,
    };
  }

  async function streamReply(text, handlers = {}) {
    const { onText = () => {}, onComplete = () => {}, onError = () => {}, signal } = handlers;

    try {
      await ensureConversation();
      const request = buildChatRequest(text);
      const response = await fetchImpl(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(request.body),
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
    buildChatRequest,
    getConversationId() {
      return conversationId;
    },
    parseChunk(chunk) {
      return parseChunk(chunk).contents;
    },
    resetConversation() {
      conversationId = "";
    },
    streamReply,
  };
}
