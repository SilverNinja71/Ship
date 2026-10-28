// WebRTC between crewmates as a mesh: every sailor connects to every other.
// Offers, answers and ICE travel through the crew server. Each link uses the
// "perfect negotiation" pattern, so either side can turn its mic or camera
// on at any time without the two offers colliding.

import type { RtcSignal } from "@ship/shared-types";

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

type SendSignal = (to: string, data: RtcSignal) => void;

class PeerLink {
  readonly pc: RTCPeerConnection;
  private makingOffer = false;
  private ignoreOffer = false;
  private readonly senders = new Map<string, RTCRtpSender>();

  constructor(
    readonly peerId: string,
    /** The polite peer backs off when both sides offer at once. */
    private readonly polite: boolean,
    private readonly send: SendSignal,
    onStream: (peerId: string, stream: MediaStream | null) => void,
  ) {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.send(peerId, { kind: "ice", candidate: { candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex } });
    };
    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        if (this.pc.localDescription) this.send(peerId, { kind: "offer", sdp: this.pc.localDescription.sdp });
      } catch {
        // A failed offer is retried by the next negotiationneeded.
      } finally {
        this.makingOffer = false;
      }
    };
    this.pc.ontrack = ({ streams }) => onStream(peerId, streams[0] ?? null);
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === "failed") this.pc.restartIce();
      if (this.pc.connectionState === "closed") onStream(peerId, null);
    };
  }

  async handle(signal: RtcSignal): Promise<void> {
    if (signal.kind === "ice") {
      try {
        await this.pc.addIceCandidate(signal.candidate);
      } catch {
        // Candidates for an offer we chose to ignore are expected to fail.
      }
      return;
    }
    const collision = signal.kind === "offer" && (this.makingOffer || this.pc.signalingState !== "stable");
    this.ignoreOffer = !this.polite && collision;
    if (this.ignoreOffer) return;
    await this.pc.setRemoteDescription({ type: signal.kind, sdp: signal.sdp });
    if (signal.kind === "offer") {
      await this.pc.setLocalDescription();
      if (this.pc.localDescription) this.send(this.peerId, { kind: "answer", sdp: this.pc.localDescription.sdp });
    }
  }

  /** Makes the link carry exactly the tracks of `stream`. */
  syncTracks(stream: MediaStream | null): void {
    const tracks = stream?.getTracks() ?? [];
    for (const [id, sender] of this.senders) {
      if (!tracks.some((t) => t.id === id)) {
        this.pc.removeTrack(sender);
        this.senders.delete(id);
      }
    }
    for (const track of tracks) {
      if (!this.senders.has(track.id) && stream) this.senders.set(track.id, this.pc.addTrack(track, stream));
    }
  }

  close(): void {
    this.pc.close();
  }
}

export class CrewMesh {
  private readonly links = new Map<string, PeerLink>();
  private local: MediaStream | null = null;

  constructor(
    private readonly myId: string,
    private readonly send: SendSignal,
    private readonly onStream: (peerId: string, stream: MediaStream | null) => void,
  ) {}

  private link(peerId: string): PeerLink {
    let link = this.links.get(peerId);
    if (!link) {
      link = new PeerLink(peerId, this.myId > peerId, this.send, this.onStream);
      link.syncTracks(this.local);
      this.links.set(peerId, link);
    }
    return link;
  }

  /** Opens links to new crewmates and closes links to ones who left. */
  setPeers(peerIds: readonly string[]): void {
    const wanted = new Set(peerIds.filter((id) => id !== this.myId));
    for (const [id, link] of this.links) {
      if (!wanted.has(id)) {
        link.close();
        this.links.delete(id);
        this.onStream(id, null);
      }
    }
    for (const id of wanted) this.link(id);
  }

  handleSignal(from: string, signal: RtcSignal): void {
    void this.link(from).handle(signal).catch(() => {});
  }

  setLocalStream(stream: MediaStream | null): void {
    this.local = stream;
    for (const link of this.links.values()) link.syncTracks(stream);
  }

  close(): void {
    for (const [id, link] of this.links) {
      link.close();
      this.onStream(id, null);
    }
    this.links.clear();
  }
}
