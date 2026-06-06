export interface Participant {
  id: string;
  name: string;
  role: "host" | "guest";
  stream?: MediaStream;
  mediaError?: string;
  isLocal: boolean;
  isSpeaking?: boolean;
}
