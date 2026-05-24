export interface Participant {
  id: string;
  name: string;
  role: "host" | "guest";
  stream?: MediaStream;
  isLocal?: boolean;
  isSpeaking?: boolean;
}
