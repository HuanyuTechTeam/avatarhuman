import type { AsrResponse } from "@/types/avatar";

interface CreateSpeechRecorderOptions {
  onRecognizedText: (text: string) => Promise<void>;
  onWakeDetected: (text: string) => Promise<void>;
  wakeWords: string[];
  isInteractionActive: () => boolean;
  asrEndpoint: string;
  fetchImpl?: typeof fetch;
}

interface SpeechRecorder {
  start(): Promise<void>;
  stop(): Promise<void>;
}

const SILENCE_THRESHOLD = 2.8;
const SILENCE_TIMEOUT = 1500;
const ANALYSER_FFT_SIZE = 2048;

export function createSpeechRecorder({
  onRecognizedText,
  onWakeDetected,
  wakeWords,
  isInteractionActive,
  asrEndpoint,
  fetchImpl = fetch,
}: CreateSpeechRecorderOptions): SpeechRecorder {
  let audioContext: AudioContext | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let analyser: AnalyserNode | null = null;
  let mediaStream: MediaStream | null = null;
  let silenceTimer: number | null = null;
  let audioChunks: Blob[] = [];
  let isStarting = false;
  let animationFrameId = 0;
  let canCapture = true;
  let recordingActive = false;

  function calculateVolume(dataArray: Uint8Array): number {
    let sum = 0;
    for (let index = 0; index < dataArray.length; index += 1) {
      sum += Math.abs(dataArray[index] - 128);
    }
    return (sum / dataArray.length) * 0.5;
  }

  async function sendToAsr(audioBlob: Blob) {
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

    const payload = (await response.json()) as AsrResponse;
    const recognized = payload?.result?.[0]?.clean_text ?? "";
    if (!recognized || recognized.length <= 1) {
      return;
    }

    if (wakeWords.includes(recognized)) {
      await onWakeDetected(recognized);
      return;
    }

    if (isInteractionActive()) {
      await onRecognizedText(recognized);
    }
  }

  function clearSilenceTimer() {
    if (silenceTimer) {
      window.clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  function handleSoundStart() {
    if ((!isInteractionActive() && wakeWords.length === 0) || !canCapture || recordingActive || !mediaRecorder) {
      clearSilenceTimer();
      return;
    }

    if (mediaRecorder.state === "inactive") {
      recordingActive = true;
      mediaRecorder.start();
    }

    clearSilenceTimer();
  }

  function handleSoundEnd() {
    if (!recordingActive || silenceTimer || !mediaRecorder) {
      return;
    }

    silenceTimer = window.setTimeout(() => {
      if (mediaRecorder?.state === "recording") {
        mediaRecorder.stop();
      }
    }, SILENCE_TIMEOUT);
  }

  function monitorVolume() {
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
      animationFrameId = window.requestAnimationFrame(checkVolume);
    };

    checkVolume();
  }

  async function start() {
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
        const mimeType = mediaRecorder?.mimeType || "audio/webm";
        const blob = new Blob(audioChunks, { type: mimeType });
        audioChunks = [];

        try {
          await sendToAsr(blob);
        } catch (error) {
          console.error("ASR request failed", error);
        } finally {
          canCapture = true;
        }
      };

      monitorVolume();
    } finally {
      isStarting = false;
    }
  }

  async function stop() {
    if (animationFrameId) {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    }

    clearSilenceTimer();

    if (mediaRecorder?.state === "recording") {
      mediaRecorder.stop();
    }

    mediaStream?.getTracks().forEach((track) => track.stop());
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
