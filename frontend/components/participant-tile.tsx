import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { Participant } from "@/components/video-grid";

interface ParticipantTileProps {
  participant: Participant;
}

function getParticipantDisplayName(participant: Participant) {
  const trimmedName = participant.name.trim();
  if (trimmedName) {
    return trimmedName;
  }

  return participant.isLocal ? "You" : participant.role === "host" ? "Host" : "Guest";
}

export function ParticipantTile({ participant }: ParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackAttemptRef = useRef(0);
  const [isPlaybackBlocked, setIsPlaybackBlocked] = useState(false);
  const [hasLiveVideoTrack, setHasLiveVideoTrack] = useState(false);
  const participantName = getParticipantDisplayName(participant);
  const participantInitial = Array.from(participantName)[0]?.toUpperCase() ?? "?";
  const showBlockedPlaybackControl =
    Boolean(participant.stream) && isPlaybackBlocked && !participant.isLocal;
  const clearBlockedPlayback = useCallback(() => {
    setIsPlaybackBlocked(false);
  }, []);

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

    const playbackAttempt = ++playbackAttemptRef.current;
    setIsPlaybackBlocked(false);

    try {
      await video.play();
      if (playbackAttempt === playbackAttemptRef.current) {
        setIsPlaybackBlocked(false);
      }
    } catch (error) {
      if (playbackAttempt !== playbackAttemptRef.current) {
        return;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setIsPlaybackBlocked(true);
    }
  }, [participant.isLocal, participant.stream]);

  useEffect(() => {
    const stream = participant.stream;
    if (!stream) {
      setHasLiveVideoTrack(false);
      return;
    }

    const trackedVideoTracks = new Set<MediaStreamTrack>();

    const updateVideoState = () => {
      setHasLiveVideoTrack(
        stream
          .getVideoTracks()
          .some((track) => track.readyState === "live" && !track.muted)
      );
    };

    const subscribeTrack = (track: MediaStreamTrack) => {
      if (track.kind !== "video") {
        return;
      }

      trackedVideoTracks.add(track);
      track.addEventListener("ended", updateVideoState);
      track.addEventListener("unmute", updateVideoState);
      track.addEventListener("mute", updateVideoState);
    };

    const unsubscribeTrack = (track: MediaStreamTrack) => {
      if (!trackedVideoTracks.has(track)) {
        return;
      }

      trackedVideoTracks.delete(track);
      track.removeEventListener("ended", updateVideoState);
      track.removeEventListener("unmute", updateVideoState);
      track.removeEventListener("mute", updateVideoState);
    };

    const handleAddTrack = (event: MediaStreamTrackEvent) => {
      subscribeTrack(event.track);
      updateVideoState();
      void syncPlayback();
    };

    const handleRemoveTrack = (event: MediaStreamTrackEvent) => {
      unsubscribeTrack(event.track);
      updateVideoState();
    };

    stream.getVideoTracks().forEach(subscribeTrack);
    stream.addEventListener("addtrack", handleAddTrack);
    stream.addEventListener("removetrack", handleRemoveTrack);
    updateVideoState();

    return () => {
      trackedVideoTracks.forEach(unsubscribeTrack);
      stream.removeEventListener("addtrack", handleAddTrack);
      stream.removeEventListener("removetrack", handleRemoveTrack);
    };
  }, [participant.stream, syncPlayback]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!participant.stream) {
      playbackAttemptRef.current += 1;
      video.pause();
      video.srcObject = null;
      setIsPlaybackBlocked(false);
      return;
    }

    void syncPlayback();

    return () => {
      playbackAttemptRef.current += 1;
      video.pause();
      if (video.srcObject === participant.stream) {
        video.srcObject = null;
      }
    };
  }, [participant.stream, syncPlayback]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 via-white/3 to-white/0 p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between text-sm text-white/90">
        <div className="font-semibold">{participantName}</div>
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
          aria-label={`${participantName} media feed`}
          onLoadedMetadata={() => {
            void syncPlayback();
          }}
          onPlaying={clearBlockedPlayback}
          onEmptied={clearBlockedPlayback}
        />
        {!hasLiveVideoTrack && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 text-center text-sm text-slate-200">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10 text-lg font-semibold text-white">
              {participantInitial}
            </div>
            <div>
              {participant.isLocal ? "Camera preview unavailable" : "No live video available"}
            </div>
            {showBlockedPlaybackControl && (
              <button
                type="button"
                className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
                onClick={() => {
                  void syncPlayback();
                }}
              >
                Resume media
              </button>
            )}
          </div>
        )}
        {hasLiveVideoTrack && showBlockedPlaybackControl && (
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
