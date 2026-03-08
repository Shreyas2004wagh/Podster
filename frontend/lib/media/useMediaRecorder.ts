import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RECORDING_MIME_TYPE } from "@podster/shared";
import { saveChunk } from "@/lib/storage/indexedDb";

interface UseMediaRecorderOptions {
  stream: MediaStream | null;
  sessionId: string;
  userId: string;
  onStop?: () => void;
}

export function useMediaRecorder({
  stream,
  sessionId,
  userId,
  onStop
}: UseMediaRecorderOptions) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const partNumber = useRef(0);
  const pendingChunkSaves = useRef<Promise<void>[]>([]);
  const shouldNotifyOnStop = useRef(false);

  const canRecord = useMemo(() => typeof window !== "undefined" && !!MediaRecorder, []);

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        shouldNotifyOnStop.current = false;
        recorder.stop();
      }
      recorderRef.current = null;
    };
  }, [stream]);

  const startRecording = useCallback(() => {
    console.log("startRecording called. Stream:", !!stream, "active:", stream?.active, "canRecord:", canRecord);
    if (!stream || !canRecord) {
      console.warn("Cannot start recording: stream or support missing");
      setLastError("Recording not available in this browser or stream not ready.");
      return;
    }
    setLastError(null);
    setIsRecording(true);
    partNumber.current = 0;
    shouldNotifyOnStop.current = true;

    let mimeType = RECORDING_MIME_TYPE;
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      console.warn(`MIME type ${mimeType} not supported. Falling back to default.`);
      mimeType = ""; // Let browser choose default
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch (err) {
      console.error("Failed to create MediaRecorder:", err);
      setLastError(`Failed to create recorder: ${(err as Error).message}`);
      setIsRecording(false);
      shouldNotifyOnStop.current = false;
      return;
    }

    recorderRef.current = recorder;

    recorder.ondataavailable = async (event: BlobEvent) => {
      if (!event.data || event.data.size === 0) return;
      partNumber.current += 1;
      const savePromise = saveChunk(sessionId, {
        partNumber: partNumber.current,
        blob: event.data,
        createdAt: Date.now(),
        userId
      });
      pendingChunkSaves.current.push(savePromise);
      void savePromise.finally(() => {
        pendingChunkSaves.current = pendingChunkSaves.current.filter((pending) => pending !== savePromise);
      });
    };

    recorder.onerror = (err) => {
      shouldNotifyOnStop.current = false;
      setLastError(err.error.message);
      setIsRecording(false);
    };

    recorder.onstop = () => {
      const notifyOnStop = shouldNotifyOnStop.current;
      shouldNotifyOnStop.current = false;
      console.log("MediaRecorder stopped.", { notifyOnStop });
      setIsRecording(false);
      void (async () => {
        await Promise.allSettled(pendingChunkSaves.current);
        pendingChunkSaves.current = [];
        setIsProcessing(false);
        if (notifyOnStop) {
          onStop?.();
        }
      })();
    };

    setStartedAt(Date.now());
    recorder.start(1000); // slice every second; persistence handled in IndexedDB
    setIsProcessing(false);
  }, [canRecord, onStop, sessionId, stream, userId]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      setIsProcessing(true);
      shouldNotifyOnStop.current = true;
      console.log("Stopping recorder...");
      recorderRef.current.requestData(); // Flush final data
      recorderRef.current.stop();
    }
  }, []);

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isRecording]);

  const durationLabel = useMemo(() => {
    if (!startedAt || !isRecording) return "00:00";
    const elapsed = Math.floor((now - startedAt) / 1000);
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const seconds = String(elapsed % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [isRecording, startedAt, now]);

  return {
    startRecording,
    stopRecording,
    isRecording,
    isProcessing,
    durationLabel,
    lastError
  };
}
