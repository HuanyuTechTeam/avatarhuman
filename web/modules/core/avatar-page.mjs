import { splitTextByPunctuation } from "./streaming.mjs";
import { AvatarWebRtcClient } from "./webrtc-client.mjs";

function joinAssetPath(basePath, relativePath) {
  return `${basePath.replace(/\/$/, "")}/${relativePath.replace(/^\//, "")}`;
}

function createDomState(documentRef, assetBasePath, displayAiMessages) {
  const elements = {
    presetsToggle: documentRef.getElementById("presets"),
    presetsClose: documentRef.getElementById("PresetProblem_none"),
    presetsList: documentRef.getElementById("PresetProblem_list"),
    presetsBox: documentRef.getElementsByClassName("PresetProblem_box")[0],
    inputToggle: documentRef.getElementById("inputState"),
    inputBox: documentRef.getElementById("input_box"),
    inputPanel: documentRef.getElementsByClassName("input_box")[0],
    inputSend: documentRef.getElementById("inputSending"),
    messageList: documentRef.getElementById("message-list"),
    dateBox: documentRef.getElementById("Date_box"),
    startButton: documentRef.getElementById("start"),
    endButton: documentRef.getElementById("end"),
    stopButton: documentRef.getElementById("stop"),
    controls: documentRef.getElementById("center_operating"),
    loading: documentRef.getElementById("center_toload"),
    video: documentRef.getElementById("video"),
    audio: documentRef.getElementById("audio"),
  };

  let currentAiTextNode = null;

  function scrollToBottom() {
    if (!elements.messageList) {
      return;
    }
    elements.messageList.scrollTop =
      elements.messageList.scrollHeight - elements.messageList.clientHeight;
  }

  function clearListeningHint() {
    if (!elements.messageList) {
      return;
    }
    const listenItems = elements.messageList.getElementsByClassName("listen");
    const lastListenItem = listenItems.length > 0 ? listenItems[listenItems.length - 1] : null;
    if (lastListenItem) {
      lastListenItem.remove();
    }
  }

  function appendListeningHint() {
    if (!elements.messageList) {
      return;
    }
    clearListeningHint();

    const item = documentRef.createElement("div");
    item.className = "message_item user listen";

    const image = documentRef.createElement("img");
    image.className = "message_img";
    image.src = joinAssetPath(assetBasePath, "img/dhr.png");
    image.alt = "";

    const text = documentRef.createElement("div");
    text.className = "message_text";
    text.textContent = "聆听中...";

    item.appendChild(image);
    item.appendChild(text);
    elements.messageList.appendChild(item);
    scrollToBottom();
  }

  function appendUserMessage(text) {
    if (!elements.messageList) {
      return;
    }
    const item = documentRef.createElement("div");
    item.className = "message_item user";

    const image = documentRef.createElement("img");
    image.className = "message_img";
    image.src = joinAssetPath(assetBasePath, "img/dhr.png");
    image.alt = "";

    const message = documentRef.createElement("div");
    message.className = "message_text";
    message.textContent = text;

    item.appendChild(image);
    item.appendChild(message);
    elements.messageList.appendChild(item);
    scrollToBottom();
  }

  function startAiMessage() {
    if (!displayAiMessages || !elements.messageList) {
      return;
    }

    const item = documentRef.createElement("div");
    item.className = "message_item ai";

    const image = documentRef.createElement("img");
    image.className = "message_img";
    image.src = joinAssetPath(assetBasePath, "img/dhl.png");
    image.alt = "";

    const message = documentRef.createElement("div");
    message.className = "message_text Studio";
    message.textContent = "...";

    item.appendChild(image);
    item.appendChild(message);
    elements.messageList.appendChild(item);
    currentAiTextNode = message;
    scrollToBottom();
  }

  function updateAiMessage(text) {
    if (!displayAiMessages) {
      return;
    }
    if (!currentAiTextNode) {
      startAiMessage();
    }
    if (currentAiTextNode) {
      currentAiTextNode.textContent = text;
    }
    scrollToBottom();
  }

  function finishAiMessage() {
    currentAiTextNode = null;
  }

  function clearMessages() {
    if (elements.messageList) {
      elements.messageList.innerHTML = "";
    }
    currentAiTextNode = null;
  }

  function renderPromptList(prompts, onPromptClick) {
    if (!elements.presetsList) {
      return;
    }
    elements.presetsList.innerHTML = "";
    for (const prompt of prompts) {
      const wrapper = documentRef.createElement("div");
      const item = documentRef.createElement("div");
      item.className = "PresetProblem_item";
      item.title = "点击发送预设问题";
      item.textContent = prompt;
      item.addEventListener("click", () => onPromptClick(prompt));
      wrapper.appendChild(item);
      elements.presetsList.appendChild(wrapper);
    }
  }

  return {
    elements,
    appendListeningHint,
    appendUserMessage,
    clearListeningHint,
    clearMessages,
    finishAiMessage,
    renderPromptList,
    scrollToBottom,
    startAiMessage,
    updateAiMessage,
  };
}

function startClock(windowRef, dateBox) {
  if (!dateBox) {
    return 0;
  }

  const render = () => {
    const now = new Date();
    dateBox.innerHTML = `
      <div style="font-size: 30px;">
        ${now.getFullYear()}年${(now.getMonth() + 1).toString().padStart(2, "0")}月${now
          .getDate()
          .toString()
          .padStart(2, "0")}日
      </div>
      <div style="font-size: 50px;">
        ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}
      </div>`;
  };

  render();
  return windowRef.setInterval(render, 3000);
}

function createSpeechRecorder({
  onRecognizedText,
  onWakeDetected,
  wakeWords,
  isInteractionActive,
  uiState,
  asrEndpoint,
  fetchImpl = fetch,
}) {
  const SILENCE_THRESHOLD = 2.8;
  const SILENCE_TIMEOUT = 1500;
  const ANALYSER_FFT_SIZE = 2048;

  let audioContext = null;
  let mediaRecorder = null;
  let analyser = null;
  let mediaStream = null;
  let silenceTimer = null;
  let audioChunks = [];
  let isStarting = false;
  let animationFrameId = 0;
  let canCapture = true;
  let recordingActive = false;

  function calculateVolume(dataArray) {
    let sum = 0;
    for (let index = 0; index < dataArray.length; index += 1) {
      sum += Math.abs(dataArray[index] - 128);
    }
    return (sum / dataArray.length) * 0.5;
  }

  async function sendToAsr(audioBlob) {
    try {
      const formData = new FormData();
      formData.append("files", audioBlob);
      formData.append("keys", "string");
      formData.append("lang", "zh");

      const response = await fetchImpl(asrEndpoint, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error("ASR request failed");
      }

      const payload = await response.json();
      const recognized = payload?.result?.[0]?.clean_text ?? "";
      if (!recognized || recognized.length <= 1) {
        return;
      }

      if (wakeWords.includes(recognized)) {
        if (uiState.elements.startButton) {
          uiState.elements.startButton.style.display = "none";
        }
        if (uiState.elements.controls) {
          uiState.elements.controls.style.display = "block";
        }
        if (onWakeDetected) {
          await onWakeDetected(recognized);
        }
        return;
      }

      if (isInteractionActive()) {
        await onRecognizedText(recognized);
      }
    } catch (error) {
      console.error("ASR request failed", error);
    } finally {
      canCapture = true;
      uiState.clearListeningHint();
    }
  }

  function handleSoundStart() {
    if (!isInteractionActive() || !canCapture || recordingActive || !mediaRecorder) {
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
      return;
    }

    if (mediaRecorder.state === "inactive") {
      recordingActive = true;
      mediaRecorder.start();
      uiState.appendListeningHint();
    }

    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  function handleSoundEnd() {
    if (!isInteractionActive() || !recordingActive || silenceTimer || !mediaRecorder) {
      return;
    }

    silenceTimer = setTimeout(() => {
      if (mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
    }, SILENCE_TIMEOUT);
  }

  function monitorVolume(windowRef) {
    if (!analyser) {
      return;
    }

    const dataArray = new Uint8Array(analyser.fftSize);
    const checkVolume = () => {
      if (!analyser) {
        return;
      }
      analyser.getByteTimeDomainData(dataArray);
      const volume = calculateVolume(dataArray);
      if (volume > SILENCE_THRESHOLD) {
        handleSoundStart();
      } else {
        handleSoundEnd();
      }
      animationFrameId = windowRef.requestAnimationFrame(checkVolume);
    };

    checkVolume();
  }

  async function start(windowRef) {
    if (isStarting || mediaRecorder) {
      return;
    }

    isStarting = true;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(mediaStream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = ANALYSER_FFT_SIZE;
      source.connect(analyser);

      mediaRecorder = new MediaRecorder(mediaStream);
      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };
      mediaRecorder.onstop = async () => {
        recordingActive = false;
        if (!canCapture || audioChunks.length === 0) {
          audioChunks = [];
          return;
        }
        canCapture = false;
        const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
        audioChunks = [];
        await sendToAsr(blob);
      };

      monitorVolume(windowRef);
    } finally {
      isStarting = false;
    }
  }

  async function stop(windowRef) {
    if (animationFrameId) {
      windowRef.cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    }
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
    if (mediaStream) {
      for (const track of mediaStream.getTracks()) {
        track.stop();
      }
    }
    if (audioContext) {
      await audioContext.close();
    }

    audioContext = null;
    mediaRecorder = null;
    analyser = null;
    mediaStream = null;
    audioChunks = [];
    canCapture = true;
    recordingActive = false;
  }

  return { start, stop };
}

export function createAvatarPage({
  api,
  provider,
  wakeWords,
  voiceId,
  assetBasePath,
  asrEndpoint = "/asr/api/v1/asr",
  wakeResponseText = "",
  documentRef = document,
  windowRef = window,
  displayAiMessages = true,
}) {
  const uiState = createDomState(documentRef, assetBasePath, displayAiMessages);
  const webRtcClient = new AvatarWebRtcClient({ api });

  const state = {
    sessionId: null,
    isSpeaking: false,
    aiFullText: "",
    aiSentenceRemainder: "",
    activeStreamToken: 0,
    activeStreamController: null,
    speechQueue: Promise.resolve(),
    queryStateTimer: 0,
    idleTicks: 0,
    clockTimer: 0,
  };

  const recorder = createSpeechRecorder({
    wakeWords,
    uiState,
    isInteractionActive: () => state.isSpeaking === false,
    onRecognizedText: async (text) => submitText(text),
    onWakeDetected: async () => {
      if (!wakeResponseText) {
        return;
      }
      if (displayAiMessages) {
        uiState.startAiMessage();
        uiState.updateAiMessage(wakeResponseText);
        uiState.finishAiMessage();
      }
      await dispatchAvatarText(wakeResponseText, false, state.activeStreamToken);
    },
    asrEndpoint,
  });

  async function dispatchAvatarText(text, interrupt = false, streamToken = state.activeStreamToken) {
    if (!text || !state.sessionId || streamToken !== state.activeStreamToken) {
      return;
    }
    state.speechQueue = state.speechQueue
      .catch(() => {})
      .then(() => {
        if (streamToken !== state.activeStreamToken || !state.sessionId) {
          return;
        }
        return api.sendHumanEcho({
          text,
          interrupt,
          sessionId: state.sessionId,
          voiceId,
        });
      });
    await state.speechQueue;
  }

  function showInteractionReady() {
    if (uiState.elements.loading) {
      uiState.elements.loading.style.display = "none";
    }
    if (uiState.elements.video) {
      uiState.elements.video.muted = false;
    }
    if (uiState.elements.startButton) {
      uiState.elements.startButton.style.display = "inline-block";
    }
  }

  function resetAiStreamState() {
    state.aiFullText = "";
    state.aiSentenceRemainder = "";
    uiState.finishAiMessage();
  }

  function resetConversationState() {
    if (typeof provider.resetConversation === "function") {
      provider.resetConversation();
    }
  }

  function cancelActiveStream() {
    if (state.activeStreamController) {
      state.activeStreamController.abort();
      state.activeStreamController = null;
    }
    state.activeStreamToken += 1;
    state.idleTicks = 0;
    state.speechQueue = Promise.resolve();
    resetAiStreamState();
  }

  async function pollSpeakingState() {
    if (!state.sessionId) {
      return;
    }

    try {
      const payload = await api.getSpeakingState(state.sessionId);
      state.isSpeaking = Boolean(payload.data);
      if (!state.isSpeaking) {
        state.idleTicks += 1;
        if (state.idleTicks >= 60 && uiState.elements.controls?.style.display !== "none") {
          if (uiState.elements.startButton) {
            uiState.elements.startButton.style.display = "inline-block";
          }
          if (uiState.elements.controls) {
            uiState.elements.controls.style.display = "none";
          }
          uiState.clearMessages();
          cancelActiveStream();
          resetConversationState();
        }
      } else {
        state.idleTicks = 0;
      }
    } catch (_error) {
      state.isSpeaking = true;
    }
  }

  function startSpeakingPolling() {
    if (state.queryStateTimer) {
      clearInterval(state.queryStateTimer);
    }
    state.queryStateTimer = windowRef.setInterval(() => {
      void pollSpeakingState();
    }, 1000);
  }

  async function handleAiChunk(chunk, streamToken) {
    if (streamToken !== state.activeStreamToken) {
      return;
    }
    state.aiFullText += chunk;
    uiState.updateAiMessage(state.aiFullText);

    const parsed = splitTextByPunctuation(chunk, state.aiSentenceRemainder);
    state.aiSentenceRemainder = parsed.remainder;

    for (const sentence of parsed.sentences) {
      await dispatchAvatarText(sentence, false, streamToken);
    }
  }

  async function finalizeAiStream(streamToken) {
    if (streamToken !== state.activeStreamToken) {
      return;
    }
    if (state.aiSentenceRemainder.trim()) {
      await dispatchAvatarText(state.aiSentenceRemainder, false, streamToken);
    }
    state.aiSentenceRemainder = "";
    uiState.finishAiMessage();
  }

  async function submitText(text) {
    if (!text || state.isSpeaking) {
      return;
    }

    uiState.clearListeningHint();
    uiState.appendUserMessage(text);
    cancelActiveStream();
    if (displayAiMessages) {
      uiState.startAiMessage();
    }
    const streamToken = state.activeStreamToken;
    state.activeStreamController = new AbortController();

    await provider.streamReply(text, {
      onText: (chunk) => {
        if (streamToken !== state.activeStreamToken) {
          return;
        }
        return handleAiChunk(chunk, streamToken);
      },
      onComplete: () => {
        if (streamToken !== state.activeStreamToken) {
          return;
        }
        return finalizeAiStream(streamToken);
      },
      onError: (error) => {
        if (streamToken !== state.activeStreamToken) {
          return;
        }
        console.error(error);
        uiState.finishAiMessage();
      },
      signal: state.activeStreamController.signal,
    });

    if (streamToken === state.activeStreamToken) {
      state.activeStreamController = null;
    }
  }

  async function loadPrompts() {
    try {
      const payload = await api.loadJsonAsset("/prompt.json");
      uiState.renderPromptList(payload.prompt ?? [], (prompt) => {
        if (!state.isSpeaking) {
          void submitText(prompt);
          if (uiState.elements.presetsBox) {
            uiState.elements.presetsBox.style.display = "none";
          }
        }
      });
    } catch (error) {
      console.error("获取预设问题失败", error);
    }
  }

  async function startMedia(useStunServer = false) {
    showInteractionReady();
    startSpeakingPolling();
    await recorder.start(windowRef);
    await webRtcClient.start({
      videoElement: uiState.elements.video,
      audioElement: uiState.elements.audio,
      useStunServer,
      onSessionId: (sessionId) => {
        state.sessionId = sessionId;
      },
    });
  }

  async function stopMedia() {
    cancelActiveStream();
    if (uiState.elements.loading) {
      uiState.elements.loading.style.display = "block";
    }
    webRtcClient.stop();
    await recorder.stop(windowRef);
    state.sessionId = null;
  }

  function bindEvents() {
    uiState.elements.presetsToggle?.addEventListener("click", () => {
      if (!uiState.elements.presetsBox) {
        return;
      }
      uiState.elements.presetsBox.style.display =
        uiState.elements.presetsBox.style.display === "none" ? "block" : "none";
    });

    uiState.elements.presetsClose?.addEventListener("click", () => {
      if (uiState.elements.presetsBox) {
        uiState.elements.presetsBox.style.display = "none";
      }
    });

    uiState.elements.inputToggle?.addEventListener("click", () => {
      if (!uiState.elements.inputPanel) {
        return;
      }
      uiState.elements.inputPanel.style.display =
        uiState.elements.inputPanel.style.display === "none" ? "block" : "none";
    });

    const sendInputValue = () => {
      const value = uiState.elements.inputBox?.value?.trim() ?? "";
      if (!value) {
        return;
      }
      void submitText(value);
      uiState.elements.inputBox.value = "";
      if (uiState.elements.inputPanel) {
        uiState.elements.inputPanel.style.display = "none";
      }
    };

    uiState.elements.inputSend?.addEventListener("click", sendInputValue);
    uiState.elements.inputBox?.addEventListener("keypress", (event) => {
      if (event.key === "Enter") {
        sendInputValue();
      }
    });

    uiState.elements.startButton?.addEventListener("click", () => {
      state.idleTicks = 0;
      uiState.elements.startButton.style.display = "none";
      if (uiState.elements.controls) {
        uiState.elements.controls.style.display = "block";
      }
    });

    uiState.elements.endButton?.addEventListener("click", async () => {
      state.idleTicks = 0;
      if (uiState.elements.startButton) {
        uiState.elements.startButton.style.display = "inline-block";
      }
      if (uiState.elements.controls) {
        uiState.elements.controls.style.display = "none";
      }
      uiState.clearMessages();
      cancelActiveStream();
      resetConversationState();
      await dispatchAvatarText("互动结束", true);
    });

    uiState.elements.stopButton?.addEventListener("click", async () => {
      cancelActiveStream();
      await dispatchAvatarText("播报停止", true);
    });

    windowRef.addEventListener("beforeunload", () => {
      if (state.clockTimer) {
        clearInterval(state.clockTimer);
      }
      if (state.queryStateTimer) {
        clearInterval(state.queryStateTimer);
      }
      void stopMedia();
    });
  }

  return {
    async start() {
      state.clockTimer = startClock(windowRef, uiState.elements.dateBox);
      bindEvents();
      await loadPrompts();
      windowRef.setTimeout(() => {
        void startMedia();
      }, 3000);
    },
    async stop() {
      await stopMedia();
    },
    state,
  };
}
