import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Participant } from "@/components/video-grid";

interface ParticipantTileProps {
  participant: Participant;
}

interface ParticipantMediaStatus {
  message: string;
  resumeLabel?: string;
}

function getParticipantDisplayName(participant: Participant) {
  const trimmedName = participant.name.trim();
  if (trimmedName) {
    return trimmedName;
  }

  return participant.isLocal ? "You" : participant.role === "host" ? "Host" : "Guest";
}

function getParticipantRoleLabel(role: Participant["role"]) {
  return role === "host" ? "Host" : "Guest";
}

function getParticipantMediaStatus({
  hasStream,
  hasAudioTrack,
  hasVideoTrack,
  hasLiveVideoTrack,
  isLocal,
  isPlaybackBlocked,
  isVideoReady,
}: {
  hasStream: boolean;
  hasAudioTrack: boolean;
  hasVideoTrack: boolean;
  hasLiveVideoTrack: boolean;
  isLocal: boolean;
  isPlaybackBlocked: boolean;
  isVideoReady: boolean;
}): ParticipantMediaStatus | null {
  if (isPlaybackBlocked && !isLocal) {
    return {
      message: hasVideoTrack
        ? "Browser playback is blocked."
        : hasAudioTrack
          ? "Browser audio playback is blocked."
          : "Browser media playback is blocked.",
      resumeLabel: hasVideoTrack ? "Resume playback" : hasAudioTrack ? "Resume audio" : "Resume media",
    };
  }

  if (!hasStream) {
    return {
      message: isLocal ? "Camera preview unavailable" : "Waiting for participant media",
    };
  }

  if (hasLiveVideoTrack && !isVideoReady) {
    return {
      message: isLocal ? "Starting camera preview" : "Waiting for video",
    };
  }

  if (hasLiveVideoTrack && isVideoReady) {
    return null;
  }

  if (hasVideoTrack) {
    return {
      message: isLocal ? "Camera is paused" : "Camera is unavailable",
    };
  }

  if (hasAudioTrack) {
    return {
      message: isLocal ? "Audio only" : "Audio only participant",
    };
  }

  return {
    message: isLocal ? "No live media available" : "No live media available",
  };
}

export function ParticipantTile({ participant }: ParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackAttemptRef = useRef(0);
  const [isPlaybackBlocked, setIsPlaybackBlocked] = useState(false);
  const [hasAudioTrack, setHasAudioTrack] = useState(false);
  const [hasVideoTrack, setHasVideoTrack] = useState(false);
  const [hasLiveVideoTrack, setHasLiveVideoTrack] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const participantName = getParticipantDisplayName(participant);
  const participantInitial = Array.from(participantName)[0]?.toUpperCase() ?? "?";
  const mediaStatus = getParticipantMediaStatus({
    hasStream: Boolean(participant.stream),
    hasAudioTrack,
    hasVideoTrack,
    hasLiveVideoTrack,
    isLocal: Boolean(participant.isLocal),
    isPlaybackBlocked,
    isVideoReady,
  });
  const clearBlockedPlayback = useCallback(() => {
    setIsPlaybackBlocked(false);
  }, []);
  const markVideoReady = useCallback(() => {
    setIsVideoReady(true);
    setIsPlaybackBlocked(false);
  }, []);
  const markVideoUnavailable = useCallback(() => {
    setIsVideoReady(false);
  }, []);

  const syncPlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !participant.stream) {
      setIsPlaybackBlocked(false);
      setIsVideoReady(false);
      return;
    }

    const shouldMute = Boolean(participant.isLocal);
    video.defaultMuted = shouldMute;
    video.muted = shouldMute;

    if (video.srcObject !== participant.stream) {
      video.srcObject = participant.stream;
      setIsVideoReady(false);
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

      setIsVideoReady(false);
      setIsPlaybackBlocked(true);
    }
  }, [participant.isLocal, participant.stream]);

  useEffect(() => {
    const stream = participant.stream;
    if (!stream) {
      setHasAudioTrack(false);
      setHasVideoTrack(false);
      setHasLiveVideoTrack(false);
      setIsVideoReady(false);
      return;
    }

    const trackedMediaTracks = new Set<MediaStreamTrack>();

    const updateTrackState = () => {
      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();

      setHasAudioTrack(audioTracks.some((track) => track.readyState === "live"));
      setHasVideoTrack(videoTracks.length > 0);
      setHasLiveVideoTrack(
        videoTracks.some((track) => track.readyState === "live" && !track.muted)
      );
      if (!videoTracks.some((track) => track.readyState === "live")) {
        setIsVideoReady(false);
      }
    };

    const subscribeTrack = (track: MediaStreamTrack) => {
      if (track.kind !== "audio" && track.kind !== "video") {
        return;
      }

      trackedMediaTracks.add(track);
      track.addEventListener("ended", updateTrackState);
      track.addEventListener("unmute", updateTrackState);
      track.addEventListener("mute", updateTrackState);
    };

    const unsubscribeTrack = (track: MediaStreamTrack) => {
      if (!trackedMediaTracks.has(track)) {
        return;
      }

      trackedMediaTracks.delete(track);
      track.removeEventListener("ended", updateTrackState);
      track.removeEventListener("unmute", updateTrackState);
      track.removeEventListener("mute", updateTrackState);
    };

    const handleAddTrack = (event: MediaStreamTrackEvent) => {
      subscribeTrack(event.track);
      updateTrackState();
      void syncPlayback();
    };

    const handleRemoveTrack = (event: MediaStreamTrackEvent) => {
      unsubscribeTrack(event.track);
      if (event.track.kind === "video") {
        setIsVideoReady(false);
      }
      updateTrackState();
    };

    stream.getTracks().forEach(subscribeTrack);
    stream.addEventListener("addtrack", handleAddTrack);
    stream.addEventListener("removetrack", handleRemoveTrack);
    updateTrackState();

    return () => {
      trackedMediaTracks.forEach(unsubscribeTrack);
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
      setIsVideoReady(false);
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
          {getParticipantRoleLabel(participant.role)}
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
          onLoadedData={markVideoReady}
          onPlaying={markVideoReady}
          onEmptied={() => {
            clearBlockedPlayback();
            markVideoUnavailable();
          }}
        />
        {mediaStatus && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 text-center text-sm text-slate-200"
            role="status"
            aria-live="polite"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10 text-lg font-semibold text-white">
              {participantInitial}
            </div>
            <div>{mediaStatus.message}</div>
            {mediaStatus.resumeLabel && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-full border-white/20 bg-white/10 hover:bg-white/15"
                onClick={() => {
                  void syncPlayback();
                }}
              >
                {mediaStatus.resumeLabel}
              </Button>
            )}
          </div>
        )}
      </div>
      {participant.isSpeaking && (
        <div className="absolute inset-0 pointer-events-none border-2 border-emerald-400/60 rounded-2xl animate-pulse" />
      )}
    </div>
  );
}
