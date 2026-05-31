import { useCallback, useEffect, useRef, useState } from "react";

interface UseLocalMediaOptions {
  video?: boolean;
  audio?: boolean;
}

function getMediaErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Camera and microphone access was blocked. Allow permission and try again.";
      case "NotFoundError":
        return "No camera or microphone was found on this device.";
      case "NotReadableError":
      case "AbortError":
        return "Camera or microphone is already in use by another app.";
      case "OverconstrainedError":
        return "The selected camera or microphone settings are not supported on this device.";
      default:
        return error.message || "Failed to start camera and microphone capture.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Failed to start camera and microphone capture.";
}

export function useLocalMedia(options: UseLocalMediaOptions = { video: true, audio: true }) {
  const [stream, setStreamState] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const lastOptions = useRef(options);
  const streamRef = useRef<MediaStream | null>(null);
  const startPromiseRef = useRef<Promise<MediaStream | null> | null>(null);
  const isMountedRef = useRef(true);
  const startAttemptRef = useRef(0);

  // Helper to safely set stream and ref
  const setStream = (newStream: MediaStream | null) => {
    streamRef.current = newStream;
    if (isMountedRef.current) {
      setStreamState(newStream);
    }
  };

  const stop = useCallback(() => {
    startAttemptRef.current += 1;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    setStream(null);
    if (isMountedRef.current) {
      setIsStarting(false);
    }
  }, []);

  const start = useCallback(async () => {
    if (startPromiseRef.current) {
      return startPromiseRef.current;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      const message = "Camera and microphone capture is not available in this browser.";
      setError(message);
      return null;
    }

    setIsStarting(true);
    setError(null);
    const startAttempt = ++startAttemptRef.current;
    const startPromise = (async () => {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: options.video,
        audio: options.audio
      });

      const isStaleAttempt =
        !isMountedRef.current || startAttempt !== startAttemptRef.current;
      if (isStaleAttempt) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return null;
      }

      // Stop old stream if exists before setting new one (though usually start shouldn't be called if active)
      if (streamRef.current && streamRef.current.id !== mediaStream.id) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      setStream(mediaStream);
      lastOptions.current = options;
      return mediaStream;
    })();
    startPromiseRef.current = startPromise;

    try {
      return await startPromise;
    } catch (err) {
      if (isMountedRef.current && startAttempt === startAttemptRef.current) {
        setError(getMediaErrorMessage(err));
      }
      setStream(null);
      return null;
    } finally {
      if (startPromiseRef.current === startPromise) {
        startPromiseRef.current = null;
      }
      if (isMountedRef.current && startAttempt === startAttemptRef.current) {
        setIsStarting(false);
      }
    }
  }, [options.audio, options.video]);

  // Handle constraints change
  useEffect(() => {
    // Check if options actually changed deep enough to matter
    const optsChanged = options.audio !== lastOptions.current.audio || options.video !== lastOptions.current.video;

    if (streamRef.current && optsChanged) {
      stop();
      void start();
    }
  }, [options.audio, options.video, start, stop]);

  // Cleanup on unmount ONLY
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      startAttemptRef.current += 1;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return {
    stream,
    error,
    isStarting,
    start,
    stop
  };
}
