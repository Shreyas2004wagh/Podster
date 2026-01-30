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
import { UploadWorkerClient } from "@/lib/upload/workerClient";
import { requestUploadUrls } from "@/lib/api/sessions";
import { useWebRTC } from "@/lib/webrtc/useWebRTC";

export default function RecordingRoomPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const userId = useMemo(() => `user-${sessionId}-host`, [sessionId]);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const uploadWorker = useRef<UploadWorkerClient | null>(null);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);

  const { stream, start: startMedia, error: mediaError } = useLocalMedia({ video: true, audio: true });

  const { remoteParticipants } = useWebRTC({
    sessionId,
    token: hostToken,
    stream: stream ?? null
  });

  // Define handleUpload higher up so useMediaRecorder can call it
  const handleUpload = async () => {
    console.log("handleUpload: Starting upload process...");
    setUploadError(null);
    setCompletedParts([]); // Reset completed parts for new upload
    setUploadId(null); // Reset upload ID

    // Add a small delay to allow the last chunk to be fully written to IndexedDB
    await new Promise(r => setTimeout(r, 500));

    const chunks = await listChunks(sessionId);
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
      const { urls: signed, uploadId: uId } = await requestUploadUrls(sessionId, parts.length, hostToken ?? undefined);
      urls = signed;
      setUploadId(uId); // Ensure we capture the uploadId!
    } catch (err) {
      console.error("handleUpload: Failed to get upload URLs", err);
      setUploadError("Failed to get upload URLs from server. Check backend connection.");
      return;
    }

    const uploads = parts.map((blob, idx) => ({
      id: `part-${idx + 1}`,
      url: urls[idx] ?? urls[0],
      blob
    }));

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
      userId,
      onStop: () => {
        console.log("Recorder stopped, triggering auto-upload...");
        void handleUpload();
      }
    });

  const [completedParts, setCompletedParts] = useState<Array<{ partNumber: number; etag: string }>>([]);

  useEffect(() => {
    void startMedia();
    uploadWorker.current = new UploadWorkerClient();
    uploadWorker.current.onMessage((message) => {
      if (message.type === "pong") return; // Skip pong messages

      setUploadItems((prev) =>
        prev.map((item) => {
          if (item.id !== message.id) return item;
          if (message.type === "progress") return { ...item, progress: message.progress, status: "uploading" };
          if (message.type === "completed") {
            // Store the ETag
            setCompletedParts((prevParts) => {
              // extract part number from id "part-1" -> 1
              const partNumber = parseInt(message.id.replace("part-", ""), 10);
              return [...prevParts, { partNumber, etag: message.etag }];
            });
            return { ...item, progress: 100, status: "completed" };
          }
          if (message.type === "error")
            return { ...item, status: "error", errorMessage: message.message };
          return item;
        })
      );
    });
    return () => {
      uploadWorker.current?.dispose();
    };
  }, [startMedia]);

  // Watch for all uploads completion
  useEffect(() => {
    if (uploadItems.length > 0 && completedParts.length === uploadItems.length && uploadId) {
      // All parts uploaded
      const finalize = async () => {
        console.log("All parts uploaded, finalizing...", {
          uploadId,
          partsCount: completedParts.length,
          parts: completedParts.sort((a, b) => a.partNumber - b.partNumber)
        });
        try {
          const { completeUpload } = await import("@/lib/api/sessions");
          await completeUpload(
            sessionId,
            {
              uploadId,
              parts: completedParts.sort((a, b) => a.partNumber - b.partNumber)
            },
            hostToken ?? undefined
          );
          console.log("Upload completed successfully!");
          // Clear local chunks after successful upload
          await clearChunks(sessionId);
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
  }, [completedParts.length, uploadItems.length, uploadId, sessionId, hostToken]);


  useEffect(() => {
    // Poll for token every second if not present, as it might be set asynchronously by another component
    const checkToken = () => {
      const token = localStorage.getItem("podster_host_token");
      if (token && token !== hostToken) {
        setHostToken(token);
      }
    };
    checkToken();
    const interval = setInterval(checkToken, 1000);
    return () => clearInterval(interval);
  }, [hostToken]);

  const participants: Participant[] = useMemo(
    () => [
      {
        id: userId,
        name: "You",
        role: "host",
        stream: stream ?? undefined
      },
      ...remoteParticipants.map((rp) => ({
        id: rp.id,
        name: `Guest (${rp.id.slice(0, 4)})`, // improved name later
        role: "guest" as const,
        stream: rp.stream
      }))
    ],
    [stream, userId, remoteParticipants]
  );

  // handleUpload moved up

  const handleClearLocal = async () => {
    await clearChunks(sessionId);
    setUploadItems([]);
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
        durationLabel={durationLabel}
        onStart={startRecording}
        onStop={stopRecording}
        onSave={handleUpload}
      />

      {(mediaError || lastError) && (
        <p className="text-sm text-red-200">{mediaError ?? lastError}</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Upload queue</h3>
            <Button variant="ghost" size="sm" onClick={handleClearLocal}>
              Clear local chunks
            </Button>
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
            <li>• Recording uses local MediaRecorder, not WebRTC streams.</li>
            <li>• Uploads start only after you stop, via worker parallel PUTs.</li>
            <li>• IndexedDB keeps chunks so refreshes don’t lose captures.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
