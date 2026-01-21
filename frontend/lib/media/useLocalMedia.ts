import { useCallback, useEffect, useRef, useState } from "react";

interface UseLocalMediaOptions {
  video?: boolean;
  audio?: boolean;
}

export function useLocalMedia(options: UseLocalMediaOptions = { video: true, audio: true }) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const lastOptions = useRef(options);

  const start = useCallback(async () => {
    setIsStarting(true);
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: options.video,
        audio: options.audio
      });
      setStream(mediaStream);
      lastOptions.current = options;
    } catch (err) {
      setError((err as Error).message);
      setStream(null);
    } finally {
      setIsStarting(false);
    }
  }, [options.audio, options.video]);

  const stop = useCallback(() => {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
  }, [stream]);

  useEffect(() => {
    // Restart if constraints changed
    if (stream && (options.audio !== lastOptions.current.audio || options.video !== lastOptions.current.video)) {
      stop();
      void start();
    }
  }, [options.audio, options.video, start, stop, stream]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    stream,
    error,
    isStarting,
    start,
    stop
  };
}
