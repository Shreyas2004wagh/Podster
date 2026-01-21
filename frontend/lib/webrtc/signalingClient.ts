type Listener = (payload: unknown) => void;

interface SignalingOptions {
  sessionId: string;
  token: string;
}

/**
 * Lightweight placeholder to keep WebRTC signaling concerns isolated from recording.
 * Replace with WebSocket or SFU signaling without touching recording logic.
 */
export class SignalingClient {
  private listeners: Map<string, Listener[]> = new Map();
  private connected = false;
  private readonly sessionId: string;
  private readonly token: string;

  constructor(options: SignalingOptions) {
    this.sessionId = options.sessionId;
    this.token = options.token;
  }

  async connect() {
    // TODO: swap with WebSocket signaling implementation
    this.connected = true;
    this.emit("connected", { sessionId: this.sessionId, token: this.token });
  }

  disconnect() {
    this.connected = false;
    this.emit("disconnected", undefined);
  }

  on(event: string, listener: Listener) {
    const existing = this.listeners.get(event) ?? [];
    this.listeners.set(event, [...existing, listener]);
  }

  off(event: string, listener: Listener) {
    const existing = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      existing.filter((fn) => fn !== listener)
    );
  }

  emit(event: string, payload: unknown) {
    this.listeners.get(event)?.forEach((fn) => fn(payload));
  }

  isConnected() {
    return this.connected;
  }
}
