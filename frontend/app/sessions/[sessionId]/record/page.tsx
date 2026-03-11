"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VideoGrid, type Participant } from "@/components/video-grid";
import { RecordingControls } from "@/components/recording-controls";
import { UploadProgress, type UploadItem } from "@/components/upload-progress";
import { useLocalMedia } from "@/lib/media/useLocalMedia";
import { useMediaRecorder } from "@/lib/media/useMediaRecorder";
import { listChunks, splitBlob, clearChunks } from "@/lib/storage/indexedDb";
import { UploadWorkerClient, type UploadJob } from "@/lib/upload/workerClient";
import { requestUploadUrls, startSession } from "@/lib/api/sessions";
import { getViewerSession, type ViewerSession } from "@/lib/session/viewer";
import { useWebRTC } from "@/lib/webrtc/useWebRTC";

export default function RecordingRoomPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const uploadWorker = useRef<UploadWorkerClient | null>(null);
  const uploadJobsRef = useRef<UploadJob[]>([]);
  const [viewer, setViewer] = useState<ViewerSession | null>(null);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);

  useEffect(() => {
    setViewer(getViewerSession(sessionId));
  }, [sessionId]);

  const { stream, start: startMedia, error: mediaError } = useLocalMedia({ video: true, audio: true });

  const { remoteParticipants } = useWebRTC({
    sessionId,
    stream: stream ?? null
  });

  const handleUpload = async () => {
    console.log("handleUpload: Starting upload process...");
    setUploadError(null);
    setCompletedParts([]);
    setUploadId(null);

    if (!viewer) {
      setUploadError("Missing participant identity. Rejoin the session before uploading.");
      return;
    }

    const chunks = await listChunks(sessionId, viewer.userId);
    console.log("handleUpload: Chunks found:", chunks.length);
    if (!chunks.length) {
      console.warn("handleUpload: No chunks found!");
      setUploadError("No recorded chunks found in IndexedDB.");
      return;
    }

    const combined = new Blob(chunks.map((c) => c.blob), { type: chunks[0].blob.type });
    const parts = splitBlob(combined);
    let urls: string[] = [];
    try {
      const { urls: signed, uploadId: currentUploadId } = await requestUploadUrls(sessionId, parts.length);
      if (signed.length !== parts.length) {
        setUploadError(`Upload URL mismatch: expected ${parts.length}, got ${signed.length}.`);
        return;
      }
      urls = signed;
      setUploadId(currentUploadId);
    } catch (err) {
      console.error("handleUpload: Failed to get upload URLs", err);
      setUploadError("Failed to get upload URLs from server. Check backend connection and auth.");
      return;
    }

    const uploads = parts.map((blob, idx) => ({
      id: `part-${idx + 1}`,
      url: urls[idx],
      blob
    }));
    uploadJobsRef.current = uploads;

    setUploadItems(
      uploads.map((upload) => ({
        id: upload.id,
        filename: upload.id,
        progress: 0,
        status: "pending"
      }))
    );

    uploadWorker.current?.upload(uploads);
  };

  const { startRecording, stopRecording, isRecording, isProcessing, durationLabel, lastError } =
    useMediaRecorder({
      stream,
      sessionId,
      userId: viewer?.userId ?? `unknown-${sessionId}`,
      onStop: () => {
        console.log("Recorder stopped, triggering auto-upload...");
        void handleUpload();
      }
    });

  const [completedParts, setCompletedParts] = useState<Array<{ partNumber: number; etag: string }>>([]);
  const sortedCompletedParts = useMemo(
    () => [...completedParts].sort((a, b) => a.partNumber - b.partNumber),
    [completedParts]
  );
  const isUploadActive = useMemo(
    () => uploadItems.some((item) => item.status === "pending" || item.status === "uploading"),
    [uploadItems]
  );

  useEffect(() => {
    void startMedia();
    uploadWorker.current = new UploadWorkerClient();
    uploadWorker.current.onMessage((message) => {
      if (message.type === "pong") return;

      setUploadItems((prev) =>
        prev.map((item) => {
          if (item.id !== message.id) return item;
          if (message.type === "progress") return { ...item, progress: message.progress, status: "uploading" };
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
        setUploadError("One or more parts failed to upload. Click Retry failed to try again.");
      }
    });
    return () => {
      uploadWorker.current?.dispose();
    };
  }, [startMedia]);

  useEffect(() => {
    const allUploaded = uploadItems.length > 0 && uploadItems.every((item) => item.status === "completed");
    if (allUploaded && sortedCompletedParts.length === uploadItems.length && uploadId && viewer) {
      const finalize = async () => {
        console.log("All parts uploaded, finalizing...", {
          uploadId,
          partsCount: sortedCompletedParts.length,
          parts: sortedCompletedParts
        });
        try {
          const { completeUpload } = await import("@/lib/api/sessions");
          await completeUpload(sessionId, {
            uploadId,
            parts: sortedCompletedParts
          });
          console.log("Upload completed successfully!");
          await clearChunks(sessionId, viewer.userId);
          setUploadItems([]);
          setCompletedParts([]);
          setUploadId(null);
        } catch (err) {
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

    if (!viewer) {
      setUploadError("Missing participant identity. Rejoin the session before recording.");
      return;
    }

    try {
      await startSession(sessionId);
    } catch (err) {
      console.error("Failed to mark session live", err);
      setUploadError("Failed to mark session live. Check backend connection and auth.");
      return;
    }

    startRecording();
  };

  const participants: Participant[] = useMemo(
    () => [
      {
        id: viewer?.userId ?? `viewer-${sessionId}`,
        name: viewer?.name ?? "You",
        role: viewer?.role ?? "host",
        isLocal: true,
        stream: stream ?? undefined
      },
      ...remoteParticipants.map((participant) => ({
        id: participant.id,
        name: `Guest (${participant.id.slice(0, 4)})`,
        role: "guest" as const,
        stream: participant.stream
      }))
    ],
    [remoteParticipants, sessionId, stream, viewer]
  );

  const handleClearLocal = async () => {
    if (!viewer) {
      setUploadError("Missing participant identity. Rejoin the session before clearing local chunks.");
      return;
    }
    await clearChunks(sessionId, viewer.userId);
    setUploadItems([]);
  };

  const handleRetryFailed = () => {
    const failedIds = new Set(uploadItems.filter((item) => item.status === "error").map((item) => item.id));
    if (failedIds.size === 0) return;
    setUploadError(null);
    setUploadItems((prev) =>
      prev.map((item) =>
        failedIds.has(item.id) ? { ...item, progress: 0, status: "pending", errorMessage: undefined } : item
      )
    );
    const retryJobs = uploadJobsRef.current.filter((job) => failedIds.has(job.id));
    uploadWorker.current?.upload(retryJobs);
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
        durationLabel={durationLabel}
        onStart={handleStart}
        onStop={stopRecording}
        onSave={handleUpload}
      />

      {(mediaError || lastError) && <p className="text-sm text-red-200">{mediaError ?? lastError}</p>}
      {!viewer && (
        <p className="text-sm text-amber-200">
          Participant identity is missing in this browser. Rejoin the session to record and upload safely.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Upload queue</h3>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleRetryFailed} disabled={isUploadActive}>
                Retry failed
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClearLocal} disabled={isUploadActive}>
                Clear local chunks
              </Button>
            </div>
          </div>
          <p className="text-sm text-slate-300">
            Chunks persist in IndexedDB until upload completes. Worker uploads in parallel.
          </p>
          <div className="mt-4">
            <UploadProgress items={uploadItems} />
            {uploadError && <p className="mt-2 text-sm text-red-200">{uploadError}</p>}
          </div>
        </Card>
        <Card>
          <h3 className="text-lg font-semibold text-white">Recording notes</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-200">
            <li>- Recording uses local MediaRecorder, not WebRTC streams.</li>
            <li>- Uploads start only after you stop, via worker parallel PUTs.</li>
            <li>- IndexedDB keeps chunks so refreshes do not lose captures.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
