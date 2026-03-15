export class AvatarWebRtcClient {
  constructor({ api, RTCPeerConnectionImpl = RTCPeerConnection } = {}) {
    this.api = api;
    this.RTCPeerConnectionImpl = RTCPeerConnectionImpl;
    this.peerConnection = null;
    this.sessionId = null;
  }

  async start({
    videoElement,
    audioElement,
    useStunServer = false,
    onSessionId = () => {},
  }) {
    const config = { sdpSemantics: "unified-plan" };
    if (useStunServer) {
      config.iceServers = [{ urls: ["stun:stun.l.google.com:19302"] }];
    }

    this.peerConnection = new this.RTCPeerConnectionImpl(config);
    this.peerConnection.addEventListener("track", (event) => {
      if (event.track.kind === "video") {
        videoElement.srcObject = event.streams[0];
      } else {
        audioElement.srcObject = event.streams[0];
      }
    });

    this.peerConnection.addTransceiver("video", { direction: "recvonly" });
    this.peerConnection.addTransceiver("audio", { direction: "recvonly" });

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    await this.waitForIceGatheringComplete();

    const answer = await this.api.createOffer({
      sdp: this.peerConnection.localDescription.sdp,
      type: this.peerConnection.localDescription.type,
    });

    this.sessionId = answer.sessionid;
    onSessionId(this.sessionId);
    await this.peerConnection.setRemoteDescription(answer);
    return answer;
  }

  waitForIceGatheringComplete() {
    if (!this.peerConnection) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      if (this.peerConnection.iceGatheringState === "complete") {
        resolve();
        return;
      }

      const checkState = () => {
        if (this.peerConnection.iceGatheringState === "complete") {
          this.peerConnection.removeEventListener("icegatheringstatechange", checkState);
          resolve();
        }
      };

      this.peerConnection.addEventListener("icegatheringstatechange", checkState);
    });
  }

  stop() {
    if (this.peerConnection && this.peerConnection.close) {
      this.peerConnection.close();
    }
    this.peerConnection = null;
    this.sessionId = null;
  }
}
