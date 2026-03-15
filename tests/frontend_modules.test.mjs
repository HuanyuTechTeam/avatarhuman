import test from "node:test";
import assert from "node:assert/strict";

import {
  buildApiUrl,
  detectBackendPrefix,
  normalizePath,
} from "../web/modules/core/paths.mjs";
import {
  extractSseJsonMessages,
  readJsonAssetFromText,
  splitTextByPunctuation,
} from "../web/modules/core/streaming.mjs";
import {
  createCozeProvider,
  createLangchainProvider,
} from "../web/modules/providers/index.mjs";

test("detectBackendPrefix uses avatarhuman prefix when page is mounted under proxy path", () => {
  assert.equal(detectBackendPrefix("/avatarhuman/cozechat-s.html"), "/avatarhuman");
  assert.equal(detectBackendPrefix("/cozechat-s.html"), "");
});

test("buildApiUrl joins prefix and route safely", () => {
  assert.equal(buildApiUrl("/avatarhuman", "/offer"), "/avatarhuman/offer");
  assert.equal(buildApiUrl("", "/offer"), "/offer");
  assert.equal(normalizePath("avatarhuman/human"), "/avatarhuman/human");
});

test("readJsonAssetFromText parses prompt payloads", () => {
  const payload = readJsonAssetFromText('{"prompt":["a","b"]}');
  assert.deepEqual(payload.prompt, ["a", "b"]);
});

test("extractSseJsonMessages reads Coze event payloads from one chunk", () => {
  const chunk = [
    "event:conversation.message.delta",
    'data:{"type":"answer","content":"你好"}',
    "",
    "event:conversation.message.delta",
    'data:{"type":"answer","content":"世界"}',
  ].join("\n");

  assert.deepEqual(extractSseJsonMessages(chunk, "conversation.message.delta"), [
    { type: "answer", content: "你好" },
    { type: "answer", content: "世界" },
  ]);
});

test("splitTextByPunctuation flushes complete sentences and preserves remainder", () => {
  const result = splitTextByPunctuation("你好，世界。后续", "");
  assert.deepEqual(result.sentences, ["你好，", "世界。"]);
  assert.equal(result.remainder, "后续");
});

test("coze provider uses configured token and bot id", () => {
  const provider = createCozeProvider({
    token: "Bearer token",
    botId: "bot-1",
  });

  assert.equal(provider.kind, "coze");
  assert.equal(provider.buildChatRequest("hi").headers.Authorization, "Bearer token");
  assert.equal(provider.buildChatRequest("hi").body.bot_id, "bot-1");
});

test("coze provider can reset its conversation state", async () => {
  let requestCount = 0;
  const provider = createCozeProvider({
    token: "Bearer token",
    botId: "bot-1",
    fetchImpl: async (url) => {
      requestCount += 1;
      if (url.includes("/conversation/create")) {
        return {
          ok: true,
          async json() {
            return { data: { id: "conversation-1" } };
          },
        };
      }

      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      };
    },
  });

  await provider.streamReply("hello");
  assert.equal(provider.getConversationId(), "conversation-1");
  provider.resetConversation();
  assert.equal(provider.getConversationId(), "");
  assert.equal(requestCount, 2);
});

test("langchain provider reads delta content from SSE payloads", () => {
  const provider = createLangchainProvider({
    kbName: "kb",
    model: "qwen",
    scoreThreshold: 0.5,
    promptName: "default",
  });
  const chunk = 'data: {"choices":[{"delta":{"content":"测试"}}]}\n\n';

  assert.deepEqual(provider.parseChunk(chunk), ["测试"]);
});

test("langchain provider respects an injected endpoint", () => {
  const provider = createLangchainProvider({
    kbName: "kb",
    model: "qwen",
    scoreThreshold: 0.5,
    promptName: "default",
    endpoint: "/avatarhuman/llm/chat/kb_chat",
  });

  assert.equal(provider.buildChatRequest("hello").url, "/avatarhuman/llm/chat/kb_chat");
});
