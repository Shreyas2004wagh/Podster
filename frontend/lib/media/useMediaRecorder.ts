import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RECORDING_MIME_TYPE } from "@podster/shared";
import { saveChunk } from "@/lib/storage/indexedDb";

interface UseMediaRecorderOptions {
  stream: MediaStream | null;
  sessionId: string;
  userId: string;
  onStop?: () => void;
}

function getMediaRecorderConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  return typeof window.MediaRecorder === "undefined" ? null : window.MediaRecorder;
}

function getRecorderErrorMessage(error: unknown) {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    switch (error.name) {
      case "NotSupportedError":
        return "Recording is not supported with the current browser media format.";
      case "InvalidStateError":
        return "Recording could not continue because the recorder is no longer active.";
      case "SecurityError":
        return "Recording was blocked by the browser security policy.";
      default:
        return error.message || "Recording failed unexpectedly.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Recording failed unexpectedly.";
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
  const hasChunkPersistenceFailure = useRef(false);
  const isMountedRef = useRef(true);

  const canRecord = useMemo(() => getMediaRecorderConstructor() !== null, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
    if (!stream || !canRecord) {
      setLastError("Recording not available in this browser or stream not ready.");
      setStartedAt(null);
      setIsRecording(false);
      setIsProcessing(false);
      return false;
    }

    setLastError(null);
    partNumber.current = 0;
    pendingChunkSaves.current = [];
    hasChunkPersistenceFailure.current = false;
    shouldNotifyOnStop.current = true;

    const MediaRecorderConstructor = getMediaRecorderConstructor();
    if (!MediaRecorderConstructor) {
      setLastError("Recording is not supported in this browser.");
      setStartedAt(null);
      setIsRecording(false);
      setIsProcessing(false);
      shouldNotifyOnStop.current = false;
      return false;
    }

    let mimeType = RECORDING_MIME_TYPE;
    if (
      typeof MediaRecorderConstructor.isTypeSupported === "function" &&
      !MediaRecorderConstructor.isTypeSupported(mimeType)
    ) {
      mimeType = "";
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorderConstructor(stream, mimeType ? { mimeType } : undefined);
    } catch (err) {
      setLastError(`Failed to create recorder: ${getRecorderErrorMessage(err)}`);
      setStartedAt(null);
      setIsRecording(false);
      setIsProcessing(false);
      shouldNotifyOnStop.current = false;
      return false;
    }

    recorderRef.current = recorder;

    recorder.ondataavailable = async (event: BlobEvent) => {
      if (!event.data || event.data.size === 0) return;
      const nextPartNumber = partNumber.current + 1;
      partNumber.current = nextPartNumber;
      const savePromise = saveChunk(sessionId, {
        partNumber: nextPartNumber,
        blob: event.data,
        createdAt: Date.now(),
        userId
      }).catch((error) => {
        if (!isMountedRef.current) {
          return;
        }
        hasChunkPersistenceFailure.current = true;
        const message =
          error instanceof Error ? error.message : "Failed to persist a recording chunk.";
        setLastError(message);
        const activeRecorder = recorderRef.current;
        if (activeRecorder && activeRecorder.state === "recording") {
          shouldNotifyOnStop.current = false;
          activeRecorder.stop();
        }
        throw error;
      });
      pendingChunkSaves.current.push(savePromise);
      const removePendingSave = () => {
        pendingChunkSaves.current = pendingChunkSaves.current.filter((pending) => pending !== savePromise);
      };
      void savePromise.then(removePendingSave, removePendingSave);
    };

    recorder.onerror = (err) => {
      shouldNotifyOnStop.current = false;
      recorderRef.current = null;
      if (!isMountedRef.current) {
        return;
      }
      setStartedAt(null);
      setIsRecording(false);
      setIsProcessing(false);
      setLastError(getRecorderErrorMessage(err.error));
    };

    recorder.onstop = () => {
      recorderRef.current = null;
      const notifyOnStop = shouldNotifyOnStop.current;
      shouldNotifyOnStop.current = false;
      void (async () => {
        const results = await Promise.allSettled(pendingChunkSaves.current);
        pendingChunkSaves.current = [];
        if (!isMountedRef.current) {
          return;
        }
        const hadPersistenceFailure =
          hasChunkPersistenceFailure.current ||
          results.some((result) => result.status === "rejected");
        hasChunkPersistenceFailure.current = hadPersistenceFailure;
        setIsRecording(false);
        setIsProcessing(false);
        setStartedAt(null);
        if (hadPersistenceFailure) {
          setLastError("A recording chunk failed to persist locally. Upload was cancelled.");
          return;
        }
        if (notifyOnStop) {
          onStop?.();
        }
      })();
    };

    try {
      recorder.start(1000);
    } catch (err) {
      recorderRef.current = null;
      shouldNotifyOnStop.current = false;
      setLastError(`Failed to start recorder: ${getRecorderErrorMessage(err)}`);
      setStartedAt(null);
      setIsRecording(false);
      setIsProcessing(false);
      return false;
    }

    setStartedAt(Date.now());
    setIsRecording(true);
    setIsProcessing(false);
    return true;
  }, [canRecord, onStop, sessionId, stream, userId]);

  const stopRecording = useCallback((notifyOnStop = true) => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      setIsProcessing(true);
      shouldNotifyOnStop.current = notifyOnStop;
      recorderRef.current.requestData();
      recorderRef.current.stop();
      return true;
    }
    return false;
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
    canRecord,
    isRecording,
    isProcessing,
    durationLabel,
    lastError
  };
}
