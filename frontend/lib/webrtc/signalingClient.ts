import { io, Socket } from "socket.io-client";
import { env } from "@/lib/env";

type Listener = (payload: any) => void;

interface SignalingOptions {
  sessionId: string;
  token: string;
}

export class SignalingClient {
  private socket: Socket;
  private readonly sessionId: string;
  private readonly token: string;

  constructor(options: SignalingOptions) {
    this.sessionId = options.sessionId;
    this.token = options.token;

    // Connect to backend URL (remove /api/v1 if needed, or assume backend root handles socket.io)
    // Adjust based on your backend URL structure. 
    // If NEXT_PUBLIC_API_URL is "http://localhost:4000", socket.io usually looks for /socket.io
    const url = env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");

    this.socket = io(url, {
      autoConnect: false,
      reconnection: true,
      query: {
        sessionId: this.sessionId,
        token: this.token
      }
    });

    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on("connect", () => {
      console.log("Signaling: Connected to socket");
      // Explicitly join room after connection
      this.socket.emit("join-room", { sessionId: this.sessionId, token: this.token });
    });

    this.socket.on("connect_error", (err) => {
      console.error("Signaling: Connection error", err);
    });

    this.socket.on("disconnect", (reason) => {
      console.log("Signaling: Disconnected", reason);
    });
  }

  async connect() {
    if (this.socket.connected) return;
    this.socket.connect();
  }

  disconnect() {
    if (this.socket.connected) {
      this.socket.disconnect();
    }
  }

  on(event: string, listener: Listener) {
    this.socket.on(event, listener);
  }

  off(event: string, listener: Listener) {
    this.socket.off(event, listener);
  }

  emit(event: string, payload: any) {
    this.socket.emit(event, payload);
  }

  // Helper methods for WebRTC specific signals
  sendOffer(to: string, offer: RTCSessionDescriptionInit) {
    this.socket.emit("offer", { to, offer });
  }

  sendAnswer(to: string, answer: RTCSessionDescriptionInit) {
    this.socket.emit("answer", { to, answer });
  }

  sendIceCandidate(to: string, candidate: RTCIceCandidate) {
    this.socket.emit("ice-candidate", { to, candidate });
  }

  getId() {
    return this.socket.id;
  }
}
