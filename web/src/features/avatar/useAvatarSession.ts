import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AvatarWebRtcClient } from "@/lib/core/webrtc-client";
import { createConversationController } from "@/features/avatar/services/conversationController";
import { createSpeechRecorder } from "@/features/avatar/services/speechRecorder";
import type { AvatarApi, ChatMessage, Provider } from "@/types/avatar";

interface UseAvatarSessionOptions {
  api: AvatarApi;
  provider: Provider;
  wakeWords: string[];
  voiceId: string;
  asrEndpoint: string;
  wakeResponseText: string;
  displayAiMessages: boolean;
  loadPrompts: () => Promise<string[]>;
}

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatClock(now: Date) {
  return {
    date: `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, "0")}月${String(
      now.getDate(),
    ).padStart(2, "0")}日`,
    time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
  };
}

export function useAvatarSession({
  api,
  provider,
  wakeWords,
  voiceId,
  asrEndpoint,
  wakeResponseText,
  displayAiMessages,
  loadPrompts,
}: UseAvatarSessionOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionIdRef = useRef<number | null>(null);
  const currentAiMessageIdRef = useRef<string | null>(null);
  const idleTicksRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const isInteractionActiveRef = useRef(false);
  const submitTextRef = useRef<(text: string) => Promise<void>>(async () => {});
  const loadPromptsRef = useRef(loadPrompts);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [showPrompts, setShowPrompts] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isInteractionActive, setIsInteractionActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [clock, setClock] = useState(() => formatClock(new Date()));
  const [errorMessage, setErrorMessage] = useState("");

  const webRtcClient = useMemo(() => new AvatarWebRtcClient({ api }), [api]);

  const appendListeningHint = useCallback(() => {
    setMessages((previous) => {
      const next = previous.filter((message) => message.role !== "listening");
      return [...next, { id: createMessageId("listening"), role: "listening", text: "聆听中..." }];
    });
  }, []);

  const clearListeningHint = useCallback(() => {
    setMessages((previous) => previous.filter((message) => message.role !== "listening"));
  }, []);

  const appendUserMessage = useCallback((text: string) => {
    setMessages((previous) => [
      ...previous.filter((message) => message.role !== "listening"),
      { id: createMessageId("user"), role: "user", text },
    ]);
  }, []);

  const startAiMessage = useCallback(() => {
    if (!displayAiMessages) {
      return;
    }
    const id = createMessageId("ai");
    currentAiMessageIdRef.current = id;
    setMessages((previous) => [...previous, { id, role: "ai", text: "..." }]);
  }, [displayAiMessages]);

  const updateAiMessage = useCallback(
    (text: string) => {
      if (!displayAiMessages) {
        return;
      }

      const currentId = currentAiMessageIdRef.current;
      if (!currentId) {
        startAiMessage();
      }

      setMessages((previous) => {
        const activeId = currentAiMessageIdRef.current;
        return previous.map((message) =>
          message.id === activeId ? { ...message, text } : message,
        );
      });
    },
    [displayAiMessages, startAiMessage],
  );

  const finishAiMessage = useCallback(() => {
    currentAiMessageIdRef.current = null;
  }, []);

  const clearMessages = useCallback(() => {
    currentAiMessageIdRef.current = null;
    setMessages([]);
  }, []);

  const conversationController = useMemo(
    () =>
      createConversationController({
        api,
        provider,
        voiceId,
        getSessionId: () => sessionIdRef.current,
        onAiTextStart: startAiMessage,
        onAiTextUpdate: updateAiMessage,
        onAiTextFinish: finishAiMessage,
      }),
    [api, provider, voiceId, startAiMessage, updateAiMessage, finishAiMessage],
  );

  const submitText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSpeaking) {
        return;
      }

      clearListeningHint();
      appendUserMessage(trimmed);
      idleTicksRef.current = 0;
      try {
        await conversationController.submitText(trimmed);
      } catch (error) {
        console.error(error);
        setErrorMessage("发送请求失败，请稍后重试。");
      }
    },
    [appendUserMessage, clearListeningHint, conversationController, isSpeaking],
  );

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    isInteractionActiveRef.current = isInteractionActive;
  }, [isInteractionActive]);

  useEffect(() => {
    submitTextRef.current = submitText;
  }, [submitText]);

  useEffect(() => {
    loadPromptsRef.current = loadPrompts;
  }, [loadPrompts]);

  const speechRecorder = useMemo(
    () =>
      createSpeechRecorder({
        wakeWords,
        asrEndpoint,
        isInteractionActive: () => !isSpeakingRef.current && isInteractionActiveRef.current,
        onRecognizedText: async (text) => {
          appendListeningHint();
          await submitTextRef.current(text);
        },
        onWakeDetected: async () => {
          setIsInteractionActive(true);
          if (!wakeResponseText) {
            return;
          }

          if (displayAiMessages) {
            startAiMessage();
            updateAiMessage(wakeResponseText);
            finishAiMessage();
          }

          try {
            idleTicksRef.current = 0;
            await conversationController.dispatchAvatarText(wakeResponseText, false);
          } catch (error) {
            console.error(error);
          }
        },
      }),
    [
      appendListeningHint,
      asrEndpoint,
      conversationController,
      displayAiMessages,
      finishAiMessage,
      startAiMessage,
      updateAiMessage,
      wakeResponseText,
      wakeWords,
    ],
  );

  const startMedia = useCallback(async () => {
    const videoElement = videoRef.current;
    const audioElement = audioRef.current;
    if (!videoElement || !audioElement) {
      return;
    }

    setErrorMessage("");
    await webRtcClient.start({
      videoElement,
      audioElement,
      onSessionId: (sessionId) => {
        sessionIdRef.current = sessionId;
      },
    });
    try {
      await speechRecorder.start();
    } catch (error) {
      console.error(error);
      setErrorMessage("麦克风初始化失败，语音唤醒不可用，请检查浏览器权限。");
    }
    setIsLoading(false);
  }, [speechRecorder, webRtcClient]);

  const stopMedia = useCallback(async () => {
    conversationController.cancelActiveStream();
    webRtcClient.stop();
    await speechRecorder.stop();
    sessionIdRef.current = null;
  }, [conversationController, speechRecorder, webRtcClient]);

  const interruptSpeech = useCallback(async () => {
    conversationController.cancelActiveStream();
    try {
      idleTicksRef.current = 0;
      await conversationController.dispatchAvatarText("播报停止", true);
    } catch (error) {
      console.error(error);
    }
  }, [conversationController]);

  const endInteraction = useCallback(async () => {
    setIsInteractionActive(false);
    setShowPrompts(false);
    setShowInput(false);
    clearMessages();
    conversationController.cancelActiveStream();
    conversationController.resetConversationState();
    try {
      idleTicksRef.current = 0;
      await conversationController.dispatchAvatarText("互动结束", true);
    } catch (error) {
      console.error(error);
    }
  }, [clearMessages, conversationController]);

  const sendInput = useCallback(async () => {
    const value = inputValue.trim();
    if (!value) {
      return;
    }
    setInputValue("");
    setShowInput(false);
    await submitText(value);
  }, [inputValue, submitText]);

  useEffect(() => {
    let disposed = false;

    void loadPromptsRef.current()
      .then((nextPrompts) => {
        if (!disposed) {
          setPrompts(nextPrompts);
        }
      })
      .catch((error) => {
        console.error("获取预设问题失败", error);
      });

    const startTimerId = window.setTimeout(() => {
      void startMedia().catch((error) => {
        console.error(error);
        setIsLoading(false);
        setErrorMessage("初始化视频会话失败，请检查后端服务或 WebRTC 会话。");
      });
    }, 3000);

    return () => {
      disposed = true;
      window.clearTimeout(startTimerId);
      void stopMedia();
    };
  }, [startMedia, stopMedia]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setClock(formatClock(new Date()));
    }, 3000);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      const sessionId = sessionIdRef.current;
      if (sessionId === null) {
        return;
      }

      void api
        .getSpeakingState(sessionId)
        .then((payload) => {
          const speaking = Boolean(payload.data);
          setIsSpeaking(speaking);
          if (speaking) {
            idleTicksRef.current = 0;
            return;
          }

          idleTicksRef.current += 1;
          if (isInteractionActive && idleTicksRef.current >= 60) {
            setIsInteractionActive(false);
            setShowPrompts(false);
            setShowInput(false);
            clearMessages();
            conversationController.cancelActiveStream();
            conversationController.resetConversationState();
          }
        })
        .catch(() => {
          setIsSpeaking(true);
          idleTicksRef.current = 0;
        });
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [api, clearMessages, conversationController, isInteractionActive]);

  return {
    audioRef,
    clock,
    errorMessage,
    inputValue,
    isInteractionActive,
    isLoading,
    messages,
    prompts,
    setInputValue,
    showInput,
    showPrompts,
    videoRef,
    closePrompts: () => setShowPrompts(false),
    endInteraction,
    interruptSpeech,
    sendInput,
    startInteraction: () => setIsInteractionActive(true),
    submitText,
    toggleInput: () => setShowInput((value) => !value),
    togglePrompts: () => setShowPrompts((value) => !value),
  };
}
