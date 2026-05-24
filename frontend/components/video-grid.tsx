import { ParticipantTile } from "@/components/participant-tile";
import type { Participant } from "@/components/video-grid.types";

interface VideoGridProps {
  participants: Participant[];
}

export function VideoGrid({ participants }: VideoGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {participants.map((participant) => (
        <ParticipantTile key={participant.id} participant={participant} />
      ))}
      {participants.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-slate-300">
          Waiting for participants...
        </div>
      )}
    </div>
  );
}
