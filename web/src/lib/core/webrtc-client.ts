import type { AvatarApi } from "@/types/avatar";

type RTCPeerConnectionCtor = typeof RTCPeerConnection;

interface StartOptions {
  videoElement: HTMLVideoElement;
  audioElement: HTMLAudioElement;
  useStunServer?: boolean;
  onSessionId?: (sessionId: number) => void;
}

interface CreateOptions {
  api: AvatarApi;
  RTCPeerConnectionImpl?: RTCPeerConnectionCtor;
}

export class AvatarWebRtcClient {
  private readonly api: AvatarApi;

  private readonly RTCPeerConnectionImpl: RTCPeerConnectionCtor;

  private peerConnection: RTCPeerConnection | null = null;

  private sessionId: number | null = null;

  constructor({ api, RTCPeerConnectionImpl = RTCPeerConnection }: CreateOptions) {
    this.api = api;
    this.RTCPeerConnectionImpl = RTCPeerConnectionImpl;
  }

  async start({
    videoElement,
    audioElement,
    useStunServer = false,
    onSessionId = () => {},
  }: StartOptions) {
    const config: RTCConfiguration = { sdpSemantics: "unified-plan" as RTCSdpSemantics };
    if (useStunServer) {
      config.iceServers = [{ urls: ["stun:stun.l.google.com:19302"] }];
    }

    this.peerConnection = new this.RTCPeerConnectionImpl(config);
    this.peerConnection.addEventListener("track", (event) => {
      if (event.track.kind === "video") {
        videoElement.srcObject = event.streams[0] ?? null;
      } else {
        audioElement.srcObject = event.streams[0] ?? null;
      }
    });

    this.peerConnection.addTransceiver("video", { direction: "recvonly" });
    this.peerConnection.addTransceiver("audio", { direction: "recvonly" });

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    await this.waitForIceGatheringComplete();

    const localDescription = this.peerConnection.localDescription;
    if (!localDescription) {
      throw new Error("Local description missing");
    }

    const answer = await this.api.createOffer({
      sdp: localDescription.sdp ?? "",
      type: localDescription.type,
    });

    this.sessionId = answer.sessionid;
    onSessionId(this.sessionId);
    await this.peerConnection.setRemoteDescription(answer);
    return answer;
  }

  private waitForIceGatheringComplete(): Promise<void> {
    if (!this.peerConnection) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      if (this.peerConnection?.iceGatheringState === "complete") {
        resolve();
        return;
      }

      const checkState = () => {
        if (this.peerConnection?.iceGatheringState === "complete") {
          this.peerConnection?.removeEventListener("icegatheringstatechange", checkState);
          resolve();
        }
      };

      this.peerConnection.addEventListener("icegatheringstatechange", checkState);
    });
  }

  stop() {
    this.peerConnection?.close();
    this.peerConnection = null;
    this.sessionId = null;
  }
}
