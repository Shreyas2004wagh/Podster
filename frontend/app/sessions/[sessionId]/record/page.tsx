"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VideoGrid } from "@/components/video-grid";
import type { Participant } from "@/components/video-grid.types";
import { RecordingControls } from "@/components/recording-controls";
import { UploadProgress, type UploadItem } from "@/components/upload-progress";
import { TextArea } from "@/components/ui/textarea";
import { useLocalMedia } from "@/lib/media/useLocalMedia";
import { useMediaRecorder } from "@/lib/media/useMediaRecorder";
import { buildUploadParts, listChunks, clearChunks } from "@/lib/storage/indexedDb";
import { UploadWorkerClient, type UploadJob } from "@/lib/upload/workerClient";
import { completeUpload, requestUploadUrls, startSession } from "@/lib/api/sessions";
import { getSessionNotes, saveSessionNotes } from "@/lib/session/notes";
import { getViewerSession, type ViewerSession } from "@/lib/session/viewer";
import { useWebRTC } from "@/lib/webrtc/useWebRTC";

export default function RecordingRoomPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId ?? "";
  const uploadWorker = useRef<UploadWorkerClient | null>(null);
  const uploadJobsRef = useRef<UploadJob[]>([]);
  const preparingUploadRef = useRef(false);
  const finalizingUploadRef = useRef<string | null>(null);
  const [viewer, setViewer] = useState<ViewerSession | null>(null);
  const [sessionNotes, setSessionNotes] = useState("");
  const [storedChunkCount, setStoredChunkCount] = useState(0);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const getUploadWorkerError = useCallback(() => {
    if (uploadWorker.current?.isAvailable()) {
      return null;
    }

    return (
      uploadWorker.current?.getInitializationError() ??
      "Background uploads are unavailable in this browser."
    );
  }, []);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    setViewer(getViewerSession(sessionId));
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !viewer) {
      setSessionNotes("");
      return;
    }

    setSessionNotes(getSessionNotes(sessionId, viewer.userId));
  }, [sessionId, viewer]);

  const {
    stream,
    start: startMedia,
    error: mediaError,
    isStarting: isStartingMedia,
  } = useLocalMedia({ video: true, audio: true });

  const { remoteParticipants, signalingError } = useWebRTC({
    sessionId,
    stream: stream ?? null,
  });

  const isHost = viewer?.role === "host";
  const refreshStoredChunkCount = useCallback(
    async (targetViewer = viewer) => {
      if (!sessionId || !targetViewer) {
        setStoredChunkCount(0);
        return [];
      }

      try {
        const chunks = await listChunks(sessionId, targetViewer.userId);
        setStoredChunkCount(chunks.length);
        return chunks;
      } catch {
        setStoredChunkCount(0);
        return [];
      }
    },
    [sessionId, viewer]
  );
  const loadStoredChunksForUpload = useCallback(
    async (targetViewer: ViewerSession) => {
      const chunks = await listChunks(sessionId, targetViewer.userId);
      setStoredChunkCount(chunks.length);
      return chunks;
    },
    [sessionId]
  );

  async function handleUpload() {
    if (preparingUploadRef.current || isUploadActive) {
      setUploadError("An upload is already being prepared or is currently running.");
      return;
    }
    if (hasFailedUploads) {
      setUploadError("Resolve the failed upload before starting a new upload request.");
      return;
    }

    preparingUploadRef.current = true;
    setUploadError(null);
    setCompletedParts([]);
    setUploadId(null);
    finalizingUploadRef.current = null;

    try {
      if (!viewer) {
        setUploadError("Missing participant identity. Rejoin the session before uploading.");
        return;
      }
      if (!sessionId) {
        setUploadError("Missing session id.");
        return;
      }
      const uploadWorkerError = getUploadWorkerError();
      if (uploadWorkerError) {
        setUploadError(uploadWorkerError);
        return;
      }

      if (lastError) {
        setUploadError(lastError);
        await refreshStoredChunkCount(viewer);
        return;
      }

      const chunks = await loadStoredChunksForUpload(viewer);
      if (!chunks.length) {
        setUploadError("No recorded chunks found in IndexedDB.");
        return;
      }

      const uploadParts = buildUploadParts(chunks);
      const { urls: signed, uploadId: currentUploadId } = await requestUploadUrls(
        sessionId,
        uploadParts.length
      );
      if (signed.length !== uploadParts.length) {
        setUploadError(
          `Upload URL mismatch: expected ${uploadParts.length}, got ${signed.length}.`
        );
        return;
      }

      setUploadId(currentUploadId);
      const uploads = uploadParts.map((blob, idx) => ({
        id: `part-${idx + 1}`,
        url: signed[idx],
        blob,
      }));
      uploadJobsRef.current = uploads;

      setUploadItems(
        uploads.map((upload) => ({
          id: upload.id,
          filename: upload.id,
          progress: 0,
          status: "pending",
        }))
      );

      uploadWorker.current?.upload(uploads);
    } catch (err) {
      setUploadError((err as Error).message || "Failed to get upload URLs from server.");
      await refreshStoredChunkCount(viewer);
    } finally {
      preparingUploadRef.current = false;
    }
  }

  const {
    startRecording,
    stopRecording,
    canRecord,
    isRecording,
    isProcessing,
    durationLabel,
    lastError,
  } =
    useMediaRecorder({
      stream,
      sessionId,
      userId: viewer?.userId ?? `unknown-${sessionId}`,
      onStop: () => {
        void handleUpload();
      },
    });

  const [completedParts, setCompletedParts] = useState<Array<{ partNumber: number; etag: string }>>(
    []
  );
  const sortedCompletedParts = useMemo(
    () => [...completedParts].sort((a, b) => a.partNumber - b.partNumber),
    [completedParts]
  );
  const isUploadActive = useMemo(
    () => uploadItems.some((item) => item.status === "pending" || item.status === "uploading"),
    [uploadItems]
  );
  const hasFailedUploads = useMemo(
    () => uploadItems.some((item) => item.status === "error"),
    [uploadItems]
  );
  const hasStoredChunks = storedChunkCount > 0;
  const hasRecoverableChunks = hasStoredChunks && !isUploadActive && !hasFailedUploads;
  const canStartRecording =
    Boolean(viewer && sessionId && stream) &&
    !isStartingMedia &&
    !hasFailedUploads &&
    !hasRecoverableChunks &&
    !mediaError &&
    canRecord;
  const resetUploadState = () => {
    setUploadItems([]);
    setCompletedParts([]);
    setUploadId(null);
    setUploadError(null);
    uploadJobsRef.current = [];
    finalizingUploadRef.current = null;
  };
  const recordingHelperText = !viewer
    ? "Rejoin the session before recording."
    : hasRecoverableChunks
      ? "Recorded chunks were found locally. Upload or clear them before starting a new take."
    : hasFailedUploads
      ? "Retry or clear the failed upload before starting a new recording."
      : isStartingMedia
        ? "Preparing local camera and microphone access."
        : isHost
          ? undefined
          : "Guests can record locally after joining, but only the host can start the session live.";

  useEffect(() => {
    resetUploadState();
    void refreshStoredChunkCount();
  }, [refreshStoredChunkCount]);

  useEffect(() => {
    void startMedia();
    const client = new UploadWorkerClient();
    uploadWorker.current = client;
    const workerError = client.getInitializationError();
    if (workerError) {
      setUploadError((currentError) => currentError ?? workerError);
    }
    const unsubscribe = client.onMessage((message) => {
      if (message.type === "pong") return;

      setUploadItems((prev) =>
        prev.map((item) => {
          if (item.id !== message.id) return item;
          if (message.type === "progress")
            return { ...item, progress: message.progress, status: "uploading" };
          if (message.type === "completed") {
            setCompletedParts((prevParts) => {
              const partNumber = parseInt(message.id.replace("part-", ""), 10);
              const without = prevParts.filter((part) => part.partNumber !== partNumber);
              return [...without, { partNumber, etag: message.etag }];
            });
            return { ...item, progress: 100, status: "completed" };
          }
          if (message.type === "error") {
            return { ...item, status: "error", errorMessage: message.message };
          }
          return item;
        })
      );
      if (message.type === "error") {
        setUploadError(message.message);
      }
    });
    return () => {
      unsubscribe();
      uploadWorker.current?.dispose();
    };
  }, [startMedia]);

  useEffect(() => {
    const allUploaded =
      uploadItems.length > 0 && uploadItems.every((item) => item.status === "completed");
    if (allUploaded && sortedCompletedParts.length === uploadItems.length && uploadId && viewer) {
      if (finalizingUploadRef.current === uploadId) {
        return;
      }

      finalizingUploadRef.current = uploadId;
      const finalize = async () => {
        try {
          await completeUpload(sessionId, {
            uploadId,
            parts: sortedCompletedParts,
          });
          await clearChunks(sessionId, viewer.userId);
          setStoredChunkCount(0);
          resetUploadState();
        } catch (err) {
          finalizingUploadRef.current = null;
          console.error("Failed to complete upload", err);
          setUploadError(`Failed to finalize upload: ${(err as Error).message}`);
        }
      };
      void finalize();
    }
  }, [sessionId, sortedCompletedParts, uploadId, uploadItems, viewer]);

  const handleStart = async () => {
    if (isUploadActive) {
      setUploadError("Wait for the current upload to finish before starting a new recording.");
      return;
    }
    if (hasRecoverableChunks) {
      setUploadError("Upload or clear the saved local chunks before starting a new recording.");
      return;
    }
    if (hasFailedUploads) {
      setUploadError("Resolve the failed upload before starting a new recording.");
      return;
    }

    if (!viewer) {
      setUploadError("Missing participant identity. Rejoin the session before recording.");
      return;
    }
    if (!sessionId) {
      setUploadError("Missing session id.");
      return;
    }

    try {
      await clearChunks(sessionId, viewer.userId);
      setStoredChunkCount(0);
    } catch (err) {
      console.error("Failed to clear stale local chunks before recording", err);
      setUploadError("Failed to reset local chunks before recording.");
      return;
    }

    resetUploadState();

    const started = startRecording();
    if (!started) {
      return;
    }

    if (viewer.role === "host") {
      try {
        await startSession(sessionId);
      } catch (err) {
        console.error("Failed to mark session live", err);
        setUploadError("Failed to mark session live. Check backend connection and auth.");
        stopRecording(false);
        return;
      }
    }
  };

  const participants: Participant[] = useMemo(
    () => [
      {
        id: viewer?.userId ?? `viewer-${sessionId}`,
        name: viewer?.name ?? "You",
        role: viewer?.role ?? "guest",
        isLocal: true,
        mediaError: mediaError ?? undefined,
        stream: stream ?? undefined,
      },
      ...remoteParticipants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        role: participant.role,
        isLocal: false,
        stream: participant.stream,
      })),
    ],
    [mediaError, remoteParticipants, sessionId, stream, viewer]
  );

  const handleClearLocal = async () => {
    if (isRecording || isProcessing) {
      setUploadError(
        "Stop recording and wait for processing to finish before clearing local chunks."
      );
      return;
    }
    if (!viewer) {
      setUploadError(
        "Missing participant identity. Rejoin the session before clearing local chunks."
      );
      return;
    }
    if (!sessionId) {
      setUploadError("Missing session id.");
      return;
    }
    try {
      await clearChunks(sessionId, viewer.userId);
      setStoredChunkCount(0);
      resetUploadState();
    } catch (err) {
      console.error("Failed to clear local chunks", err);
      setUploadError("Failed to clear local chunks. Try again.");
    }
  };

  const handleRetryFailed = () => {
    const failedIds = new Set(
      uploadItems.filter((item) => item.status === "error").map((item) => item.id)
    );
    if (failedIds.size === 0) return;
    const uploadWorkerError = getUploadWorkerError();
    if (uploadWorkerError) {
      setUploadError(uploadWorkerError);
      return;
    }
    setUploadError(null);
    setUploadItems((prev) =>
      prev.map((item) =>
        failedIds.has(item.id)
          ? { ...item, progress: 0, status: "pending", errorMessage: undefined }
          : item
      )
    );
    const retryJobs = uploadJobsRef.current.filter((job) => failedIds.has(job.id));
    uploadWorker.current?.upload(retryJobs);
  };

  const handleNotesChange = (notes: string) => {
    setSessionNotes(notes);
    if (!viewer || !sessionId) {
      return;
    }
    saveSessionNotes(sessionId, viewer.userId, notes);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-300">Recording room</p>
          <h1 className="text-3xl font-semibold text-white">Session {sessionId}</h1>
          <p className="text-slate-300">
            Live WebRTC stays separate; MediaRecorder captures locally, then uploads after stop.
          </p>
        </div>
        <Badge>Local capture</Badge>
      </div>

      <Card>
        <VideoGrid participants={participants} />
      </Card>

      <RecordingControls
        isRecording={isRecording}
        isProcessing={isProcessing}
        isUploadActive={isUploadActive}
        canStartRecording={canStartRecording}
        canUploadChunks={!hasFailedUploads}
        hasUploadableChunks={hasStoredChunks}
        startLabel={isHost ? "Start session and record" : "Start local recording"}
        helperText={recordingHelperText}
        durationLabel={durationLabel}
        onStart={handleStart}
        onStop={stopRecording}
        onSave={handleUpload}
      />

      {(mediaError || lastError || signalingError) && (
        <p className="text-sm text-red-200">{mediaError ?? lastError ?? signalingError}</p>
      )}
      {!viewer && (
        <p className="text-sm text-amber-200">
          Participant identity is missing in this browser. Rejoin the session to record and upload
          safely.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Upload queue</h3>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRetryFailed}
                disabled={isRecording || isProcessing || isUploadActive || !hasFailedUploads}
              >
                Retry failed
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearLocal}
                disabled={isRecording || isProcessing || isUploadActive}
              >
                Clear local chunks
              </Button>
            </div>
          </div>
          <p className="text-sm text-slate-300">
            Chunks persist in IndexedDB until upload completes. Worker uploads in parallel.
          </p>
          <div className="mt-4">
            <UploadProgress items={uploadItems} />
            {hasFailedUploads && (
              <p className="mt-2 text-sm text-amber-200">
                Failed uploads keep their local chunks until you retry them or clear them manually.
              </p>
            )}
            {hasRecoverableChunks && (
              <p className="mt-2 text-sm text-amber-200">
                A previous take is still saved in this browser. Upload it or clear it before starting again.
              </p>
            )}
            {uploadError && <p className="mt-2 text-sm text-red-200">{uploadError}</p>}
          </div>
        </Card>
        <Card>
          <h3 className="text-lg font-semibold text-white">Recording notes</h3>
          <p className="mt-2 text-sm text-slate-300">
            Notes stay in this browser only. They are never sent to the backend.
          </p>
          <TextArea
            aria-label="Local notes"
            className="mt-3 min-h-32"
            placeholder="Add local notes for this session..."
            value={sessionNotes}
            onChange={(event) => handleNotesChange(event.target.value)}
          />
          <ul className="mt-4 space-y-2 text-sm text-slate-200">
            <li>- Recording uses local MediaRecorder, not WebRTC streams.</li>
            <li>- Uploads start only after you stop, via worker parallel PUTs.</li>
            <li>- IndexedDB keeps chunks so refreshes do not lose captures.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
