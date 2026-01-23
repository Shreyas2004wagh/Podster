import { useCallback, useEffect, useRef, useState } from "react";

interface UseLocalMediaOptions {
  video?: boolean;
  audio?: boolean;
}

export function useLocalMedia(options: UseLocalMediaOptions = { video: true, audio: true }) {
  const [stream, setStreamState] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const lastOptions = useRef(options);
  const streamRef = useRef<MediaStream | null>(null);

  // Helper to safely set stream and ref
  const setStream = (newStream: MediaStream | null) => {
    streamRef.current = newStream;
    setStreamState(newStream);
  };

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    setStream(null);
  }, []);

  const start = useCallback(async () => {
    setIsStarting(true);
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: options.video,
        audio: options.audio
      });
      console.log("useLocalMedia: Got stream", mediaStream.id);

      // Stop old stream if exists before setting new one (though usually start shouldn't be called if active)
      if (streamRef.current && streamRef.current.id !== mediaStream.id) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      setStream(mediaStream);
      lastOptions.current = options;
    } catch (err) {
      console.error("useLocalMedia Error:", err);
      setError((err as Error).message);
      setStream(null);
    } finally {
      setIsStarting(false);
    }
  }, [options.audio, options.video]);

  // Handle constraints change
  useEffect(() => {
    // Check if options actually changed deep enough to matter
    const optsChanged = options.audio !== lastOptions.current.audio || options.video !== lastOptions.current.video;

    if (streamRef.current && optsChanged) {
      console.log("useLocalMedia: Options changed, restarting...");
      stop();
      void start();
    }
  }, [options.audio, options.video, start, stop]);

  // Cleanup on unmount ONLY
  useEffect(() => {
    return () => {
      console.log("useLocalMedia: Unmounting/Cleaning up");
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
