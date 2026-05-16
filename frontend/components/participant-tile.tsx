"use client";

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

function isTrackLive(track: MediaStreamTrack) {
  return track.readyState === "live";
}

function isTrackEnabled(track: MediaStreamTrack, isLocal: boolean) {
  return !isLocal || track.enabled;
}

function isTrackUsable(track: MediaStreamTrack, isLocal: boolean) {
  return isTrackLive(track) && !track.muted && isTrackEnabled(track, isLocal);
}

function getParticipantDisplayName(participant: Participant) {
  const rawName = typeof participant.name === "string" ? participant.name : "";
  const trimmedName = rawName.trim();
  if (trimmedName) {
    return trimmedName;
  }

  return participant.isLocal ? "You" : participant.role === "host" ? "Host" : "Guest";
}

function getParticipantInitial(participantName: string) {
  const firstVisibleCharacter = Array.from(participantName).find((character) => /\S/u.test(character));
  return firstVisibleCharacter?.toUpperCase() ?? "?";
}

function getParticipantRoleLabel(role: Participant["role"]) {
  return role === "host" ? "Host" : "Guest";
}

function getParticipantMediaStatus({
  hasStream,
  hasAnyTrack,
  hasAudioTrack,
  isStreamActive,
  hasLiveAudioTrack,
  hasVideoTrack,
  hasLiveVideoTrack,
  isLocal,
  isPlaybackBlocked,
  isVideoReady,
}: {
  hasStream: boolean;
  hasAnyTrack: boolean;
  hasAudioTrack: boolean;
  isStreamActive: boolean;
  hasLiveAudioTrack: boolean;
  hasVideoTrack: boolean;
  hasLiveVideoTrack: boolean;
  isLocal: boolean;
  isPlaybackBlocked: boolean;
  isVideoReady: boolean;
}): ParticipantMediaStatus | null {
  if (!hasStream) {
    return {
      message: isLocal ? "Camera preview unavailable" : "Waiting for participant media",
    };
  }

  if (!hasAnyTrack) {
    return {
      message: isStreamActive
        ? isLocal
          ? "Connecting camera and microphone"
          : "Connecting participant media"
        : "No live media available",
    };
  }

  if (!isStreamActive && !hasLiveAudioTrack && !hasLiveVideoTrack) {
    return {
      message: isLocal ? "Reconnecting camera and microphone" : "Reconnecting participant media",
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

  if (isPlaybackBlocked && !isLocal && (hasLiveVideoTrack || hasLiveAudioTrack)) {
    return {
      message: hasLiveVideoTrack
        ? "Browser playback is blocked."
        : "Browser audio playback is blocked.",
      resumeLabel: hasLiveVideoTrack ? "Resume playback" : "Resume audio",
    };
  }

  if (hasAudioTrack && hasVideoTrack) {
    return {
      message: isLocal ? "Camera and microphone are paused" : "Participant media is unavailable",
    };
  }

  if (hasLiveAudioTrack) {
    return {
      message: isLocal ? "Audio only" : "Audio only participant",
    };
  }

  if (hasAudioTrack) {
    return {
      message: isLocal ? "Microphone is muted" : "Microphone is unavailable",
    };
  }

  if (hasVideoTrack) {
    return {
      message: isLocal ? "Camera is paused" : "Camera is unavailable",
    };
  }

  return {
    message: "No live media available",
  };
}

export function ParticipantTile({ participant }: ParticipantTileProps) {
  const isLocalParticipant = Boolean(participant.isLocal);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackAttemptRef = useRef(0);
  const [isPlaybackBlocked, setIsPlaybackBlocked] = useState(false);
  const [hasAnyTrack, setHasAnyTrack] = useState(false);
  const [hasAudioTrack, setHasAudioTrack] = useState(false);
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [hasLiveAudioTrack, setHasLiveAudioTrack] = useState(false);
  const [hasVideoTrack, setHasVideoTrack] = useState(false);
  const [hasLiveVideoTrack, setHasLiveVideoTrack] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const participantName = getParticipantDisplayName(participant);
  const participantRoleLabel = getParticipantRoleLabel(participant.role);
  const participantInitial = getParticipantInitial(participantName);
  const mediaStatus = getParticipantMediaStatus({
    hasStream: Boolean(participant.stream),
    hasAnyTrack,
    hasAudioTrack,
    isStreamActive,
    hasLiveAudioTrack,
    hasVideoTrack,
    hasLiveVideoTrack,
    isLocal: isLocalParticipant,
    isPlaybackBlocked,
    isVideoReady,
  });
  const showVideoFeed = hasLiveVideoTrack && isVideoReady;
  const tileAriaLabel = mediaStatus
    ? `${participantName}, ${participantRoleLabel}, ${mediaStatus.message}${participant.isSpeaking ? ", speaking" : ""}`
    : `${participantName}, ${participantRoleLabel}${participant.isSpeaking ? ", speaking" : ""}`;
  const liveAnnouncement = mediaStatus
    ? `${participantName}: ${mediaStatus.message}${participant.isSpeaking ? ". Speaking." : ""}`
    : participant.isSpeaking
      ? `${participantName} is speaking.`
      : undefined;
  const clearBlockedPlayback = useCallback(() => {
    setIsPlaybackBlocked(false);
  }, []);
  const resetPlayback = useCallback((options?: { clearSource?: boolean }) => {
    setIsPlaybackBlocked(false);
    setIsVideoReady(false);
    playbackAttemptRef.current += 1;

    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.pause();
    if (options?.clearSource) {
      video.srcObject = null;
    }
  }, []);
  const markVideoReady = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const boundStream = video.srcObject;
    if (!(boundStream instanceof MediaStream)) {
      return;
    }

    if (!boundStream.getVideoTracks().some((track) => isTrackUsable(track, isLocalParticipant))) {
      return;
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth === 0) {
      return;
    }

    setIsVideoReady(true);
    setIsPlaybackBlocked(false);
  }, []);
  const markVideoUnavailable = useCallback(() => {
    setIsVideoReady(false);
    setIsPlaybackBlocked(false);
  }, []);
  const handlePlaybackError = useCallback(() => {
    setIsVideoReady(false);
    setIsPlaybackBlocked(false);
  }, []);

  const syncPlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const stream = participant.stream;
    if (!stream) {
      resetPlayback({ clearSource: true });
      return;
    }

    const shouldMute = isLocalParticipant;
    video.defaultMuted = shouldMute;
    video.muted = shouldMute;
    const hasLiveAudioTrack = stream
      .getAudioTracks()
      .some((track) => isTrackUsable(track, isLocalParticipant));
    const hasLiveVideoTrack = stream
      .getVideoTracks()
      .some((track) => isTrackUsable(track, isLocalParticipant));
    const hasLiveMediaTrack = hasLiveAudioTrack || hasLiveVideoTrack;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
      setIsVideoReady(false);
    }

    if (!hasLiveMediaTrack) {
      resetPlayback();
      return;
    }

    const playbackAttempt = ++playbackAttemptRef.current;

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
      setIsPlaybackBlocked(hasLiveMediaTrack);
    }
  }, [isLocalParticipant, participant.stream, resetPlayback]);

  useEffect(() => {
    const stream = participant.stream;
    if (!stream) {
      resetPlayback({ clearSource: true });
      setHasLiveAudioTrack(false);
      setHasAnyTrack(false);
      setHasAudioTrack(false);
      setIsStreamActive(false);
      setHasVideoTrack(false);
      setHasLiveVideoTrack(false);
      return;
    }

    const trackedMediaTracks = new Set<MediaStreamTrack>();
    const trackStateListeners = new Map<MediaStreamTrack, () => void>();

    const updateTrackState = () => {
      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();
      const hasUsableAudioTrack = audioTracks.some((track) =>
        isTrackUsable(track, isLocalParticipant)
      );
      const hasUsableVideoTrack = videoTracks.some((track) =>
        isTrackUsable(track, isLocalParticipant)
      );

      setHasAnyTrack(audioTracks.length > 0 || videoTracks.length > 0);
      setHasAudioTrack(audioTracks.length > 0);
      setIsStreamActive(stream.active);
      setHasLiveAudioTrack(hasUsableAudioTrack);
      setHasVideoTrack(videoTracks.length > 0);
      setHasLiveVideoTrack(hasUsableVideoTrack);
      if (!hasUsableAudioTrack && !hasUsableVideoTrack) {
        resetPlayback();
        return;
      }
      if (!hasUsableVideoTrack) {
        setIsVideoReady(false);
      }
    };

    const subscribeTrack = (track: MediaStreamTrack) => {
      if (track.kind !== "audio" && track.kind !== "video") {
        return;
      }

      if (trackedMediaTracks.has(track)) {
        return;
      }

      trackedMediaTracks.add(track);
      const handleTrackStateChange = () => {
        updateTrackState();
        if (isTrackUsable(track, isLocalParticipant)) {
          void syncPlayback();
        }
      };
      trackStateListeners.set(track, handleTrackStateChange);
      track.addEventListener("ended", handleTrackStateChange);
      track.addEventListener("unmute", handleTrackStateChange);
      track.addEventListener("mute", handleTrackStateChange);
    };

    const unsubscribeTrack = (track: MediaStreamTrack) => {
      if (!trackedMediaTracks.has(track)) {
        return;
      }

      trackedMediaTracks.delete(track);
      const handleTrackStateChange = trackStateListeners.get(track);
      if (!handleTrackStateChange) {
        return;
      }

      trackStateListeners.delete(track);
      track.removeEventListener("ended", handleTrackStateChange);
      track.removeEventListener("unmute", handleTrackStateChange);
      track.removeEventListener("mute", handleTrackStateChange);
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
    const handleStreamActive = () => {
      updateTrackState();
      void syncPlayback();
    };
    const handleStreamInactive = () => {
      resetPlayback();
      updateTrackState();
    };

    stream.getTracks().forEach(subscribeTrack);
    stream.addEventListener("active", handleStreamActive);
    stream.addEventListener("inactive", handleStreamInactive);
    stream.addEventListener("addtrack", handleAddTrack);
    stream.addEventListener("removetrack", handleRemoveTrack);
    updateTrackState();

    return () => {
      Array.from(trackedMediaTracks).forEach(unsubscribeTrack);
      stream.removeEventListener("active", handleStreamActive);
      stream.removeEventListener("inactive", handleStreamInactive);
      stream.removeEventListener("addtrack", handleAddTrack);
      stream.removeEventListener("removetrack", handleRemoveTrack);
    };
  }, [isLocalParticipant, participant.stream, resetPlayback, syncPlayback]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!participant.stream) {
      resetPlayback({ clearSource: true });
      return;
    }

    void syncPlayback();

    return () => {
      resetPlayback({ clearSource: video.srcObject === participant.stream });
    };
  }, [participant.stream, resetPlayback, syncPlayback]);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 via-white/3 to-white/0 p-4 shadow-lg"
      role="group"
      aria-label={tileAriaLabel}
    >
      <div className="mb-3 flex items-center justify-between gap-3 text-sm text-white/90">
        <div className="min-w-0 flex-1 truncate font-semibold" title={participantName}>
          {participantName}
        </div>
        <Badge
          className="shrink-0"
          tone={participant.role === "host" ? "success" : "default"}
        >
          {participantRoleLabel}
        </Badge>
      </div>
      <div className="relative aspect-video overflow-hidden rounded-xl border border-white/5 bg-black/60">
        <video
          ref={videoRef}
          className={`h-full w-full object-cover transition-opacity ${
            participant.isLocal ? "scale-x-[-1]" : ""
          } ${showVideoFeed ? "opacity-100" : "opacity-0"}`}
          autoPlay
          muted={participant.isLocal ?? false}
          playsInline
          aria-hidden={!showVideoFeed}
          aria-label={showVideoFeed ? `${participantName} media feed` : undefined}
          onLoadedMetadata={() => {
            void syncPlayback();
          }}
          onCanPlay={markVideoReady}
          onLoadedData={markVideoReady}
          onPlaying={markVideoReady}
          onEnded={markVideoUnavailable}
          onError={handlePlaybackError}
          onEmptied={() => {
            clearBlockedPlayback();
            markVideoUnavailable();
          }}
        />
        {mediaStatus && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 text-center text-sm text-slate-200"
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
      {liveAnnouncement && (
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {liveAnnouncement}
        </span>
      )}
      {participant.isSpeaking && (
        <div className="absolute inset-0 pointer-events-none border-2 border-emerald-400/60 rounded-2xl animate-pulse" />
      )}
    </div>
  );
}
