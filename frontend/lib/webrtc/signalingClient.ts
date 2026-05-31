import { io, Socket } from "socket.io-client";
import { env } from "@/lib/env";

type ParticipantRole = "host" | "guest";

type ParticipantMeta = {
  name: string;
  role: ParticipantRole;
};

type UserJoinedPayload = {
  socketId: string;
  user?: ParticipantMeta;
};

type UserLeftPayload = {
  socketId: string;
};

type OfferPayload = {
  from: string;
  offer: RTCSessionDescriptionInit;
  user?: ParticipantMeta;
};

type AnswerPayload = {
  from: string;
  answer: RTCSessionDescriptionInit;
  user?: ParticipantMeta;
};

type IceCandidatePayload = {
  from: string;
  candidate: RTCIceCandidateInit;
  user?: ParticipantMeta;
};

type RoomErrorPayload = {
  message: string;
};

type SignalingEventMap = {
  connect: () => void;
  "connect_error": (error: Error) => void;
  disconnect: (reason: string) => void;
  "user-joined": (payload: UserJoinedPayload) => void;
  "user-left": (payload: UserLeftPayload) => void;
  offer: (payload: OfferPayload) => void;
  answer: (payload: AnswerPayload) => void;
  "ice-candidate": (payload: IceCandidatePayload) => void;
  "room-error": (payload: RoomErrorPayload) => void;
};

type SignalingListener = (...args: never[]) => void;

interface SignalingOptions {
  sessionId: string;
}

export class SignalingClient {
  private socket: Socket;
  private readonly sessionId: string;

  constructor(options: SignalingOptions) {
    this.sessionId = options.sessionId;

    const url = env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");

    this.socket = io(url, {
      autoConnect: false,
      reconnection: true,
      withCredentials: true,
      query: {
        sessionId: this.sessionId
      }
    });

    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on("connect", () => {
      this.socket.emit("join-room", { sessionId: this.sessionId });
    });
  }

  async connect() {
    if (this.socket.connected) return;
    this.socket.connect();
  }

  disconnect() {
    if (this.socket.connected) {
      this.socket.emit("leave-room");
    }
    this.socket.removeAllListeners();
    this.socket.disconnect();
  }

  on<EventName extends keyof SignalingEventMap>(
    event: EventName,
    listener: SignalingEventMap[EventName]
  ) {
    const socket = this.socket as unknown as {
      on: (eventName: string, eventListener: SignalingListener) => void;
    };
    socket.on(event, listener as SignalingListener);
  }

  off<EventName extends keyof SignalingEventMap>(
    event: EventName,
    listener: SignalingEventMap[EventName]
  ) {
    const socket = this.socket as unknown as {
      off: (eventName: string, eventListener: SignalingListener) => void;
    };
    socket.off(event, listener as SignalingListener);
  }

  emit(event: string, payload: unknown) {
    this.socket.emit(event, payload);
  }

  sendOffer(to: string, offer: RTCSessionDescriptionInit) {
    this.socket.emit("offer", { to, offer });
  }

  sendAnswer(to: string, answer: RTCSessionDescriptionInit) {
    this.socket.emit("answer", { to, answer });
  }

  sendIceCandidate(to: string, candidate: RTCIceCandidateInit) {
    this.socket.emit("ice-candidate", { to, candidate });
  }

  getId() {
    return this.socket.id;
  }
}
