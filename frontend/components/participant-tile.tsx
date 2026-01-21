import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import type { Participant } from "@/components/video-grid";

interface ParticipantTileProps {
  participant: Participant;
}

export function ParticipantTile({ participant }: ParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current || !participant.stream) return;
    videoRef.current.srcObject = participant.stream;
  }, [participant.stream]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 via-white/3 to-white/0 p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between text-sm text-white/90">
        <div className="font-semibold">{participant.name}</div>
        <Badge tone={participant.role === "host" ? "success" : "default"}>
          {participant.role}
        </Badge>
      </div>
      <div className="aspect-video overflow-hidden rounded-xl border border-white/5 bg-black/60">
        <video ref={videoRef} className="h-full w-full object-cover" autoPlay muted playsInline />
      </div>
      {participant.isSpeaking && (
        <div className="absolute inset-0 pointer-events-none border-2 border-emerald-400/60 rounded-2xl animate-pulse" />
      )}
    </div>
  );
}
