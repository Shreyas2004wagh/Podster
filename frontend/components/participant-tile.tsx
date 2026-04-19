import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { Participant } from "@/components/video-grid";

interface ParticipantTileProps {
  participant: Participant;
}

export function ParticipantTile({ participant }: ParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaybackBlocked, setIsPlaybackBlocked] = useState(false);

  const syncPlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !participant.stream) {
      setIsPlaybackBlocked(false);
      return;
    }

    const shouldMute = Boolean(participant.isLocal);
    video.defaultMuted = shouldMute;
    video.muted = shouldMute;

    if (video.srcObject !== participant.stream) {
      video.srcObject = participant.stream;
    }

    try {
      await video.play();
      setIsPlaybackBlocked(false);
    } catch {
      setIsPlaybackBlocked(true);
    }
  }, [participant.isLocal, participant.stream]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!participant.stream) {
      video.srcObject = null;
      setIsPlaybackBlocked(false);
      return;
    }

    void syncPlayback();

    return () => {
      if (video.srcObject === participant.stream) {
        video.srcObject = null;
      }
    };
  }, [participant.stream, syncPlayback]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 via-white/3 to-white/0 p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between text-sm text-white/90">
        <div className="font-semibold">{participant.name}</div>
        <Badge tone={participant.role === "host" ? "success" : "default"}>
          {participant.role}
        </Badge>
      </div>
      <div className="relative aspect-video overflow-hidden rounded-xl border border-white/5 bg-black/60">
        <video
          ref={videoRef}
          className={`h-full w-full object-cover ${participant.isLocal ? "scale-x-[-1]" : ""}`}
          autoPlay
          muted={participant.isLocal ?? false}
          playsInline
          aria-label={`${participant.name} video feed`}
          onLoadedMetadata={() => {
            void syncPlayback();
          }}
        />
        {!participant.stream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 text-center text-sm text-slate-200">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10 text-lg font-semibold text-white">
              {participant.name.charAt(0).toUpperCase()}
            </div>
            <div>{participant.isLocal ? "Camera preview unavailable" : "Waiting for video"}</div>
          </div>
        )}
        {participant.stream && isPlaybackBlocked && !participant.isLocal && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55">
            <button
              type="button"
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
              onClick={() => {
                void syncPlayback();
              }}
            >
              Resume playback
            </button>
          </div>
        )}
      </div>
      {participant.isSpeaking && (
        <div className="absolute inset-0 pointer-events-none border-2 border-emerald-400/60 rounded-2xl animate-pulse" />
      )}
    </div>
  );
}
