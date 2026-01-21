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

  const canRecord = useMemo(() => typeof window !== "undefined" && !!MediaRecorder, []);

  useEffect(() => {
    // Clean up recorder if stream changes
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
  }, [stream]);

  const startRecording = useCallback(() => {
    if (!stream || !canRecord) {
      setLastError("Recording not available in this browser or stream not ready.");
      return;
    }
    setLastError(null);
    setIsRecording(true);
    partNumber.current = 0;
    const recorder = new MediaRecorder(stream, { mimeType: RECORDING_MIME_TYPE });
    recorderRef.current = recorder;

    recorder.ondataavailable = async (event: BlobEvent) => {
      if (!event.data || event.data.size === 0) return;
      partNumber.current += 1;
      await saveChunk(sessionId, {
        partNumber: partNumber.current,
        blob: event.data,
        createdAt: Date.now(),
        userId
      });
    };

    recorder.onerror = (err) => {
      setLastError(err.error.message);
      setIsRecording(false);
    };

    recorder.onstop = () => {
      setIsRecording(false);
      setIsProcessing(false);
      onStop?.();
    };

    setStartedAt(Date.now());
    recorder.start(1000); // slice every second; persistence handled in IndexedDB
    setIsProcessing(true);
  }, [canRecord, onStop, sessionId, stream, userId]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const durationLabel = useMemo(() => {
    if (!startedAt || !isRecording) return "00:00";
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const seconds = String(elapsed % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [isRecording, startedAt]);

  return {
    startRecording,
    stopRecording,
    isRecording,
    isProcessing,
    durationLabel,
    lastError
  };
}
