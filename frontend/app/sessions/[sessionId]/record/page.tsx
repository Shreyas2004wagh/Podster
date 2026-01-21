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

export default function RecordingRoomPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const userId = useMemo(() => `user-${sessionId}-host`, [sessionId]);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const uploadWorker = useRef<UploadWorkerClient | null>(null);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { stream, start: startMedia, error: mediaError } = useLocalMedia({ video: true, audio: true });

  const { startRecording, stopRecording, isRecording, isProcessing, durationLabel, lastError } =
    useMediaRecorder({
      stream,
      sessionId,
      userId,
      onStop: () => {
        // After stop, ready for upload step
      }
    });

  useEffect(() => {
    void startMedia();
    uploadWorker.current = new UploadWorkerClient();
    uploadWorker.current.onMessage((message) => {
      setUploadItems((prev) =>
        prev.map((item) => {
          if (item.id !== message.id) return item;
          if (message.type === "progress") return { ...item, progress: message.progress, status: "uploading" };
          if (message.type === "completed") return { ...item, progress: 100, status: "completed" };
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

  useEffect(() => {
    const token = localStorage.getItem("podster_host_token");
    if (token) {
      setHostToken(token);
    }
  }, []);

  const participants: Participant[] = useMemo(
    () => [
      {
        id: userId,
        name: "You",
        role: "host",
        stream: stream ?? undefined
      }
    ],
    [stream, userId]
  );

  const handleUpload = async () => {
    setUploadError(null);
    const chunks = await listChunks(sessionId);
    if (!chunks.length) {
      setUploadError("No recorded chunks found in IndexedDB.");
      return;
    }

    const combined = new Blob(chunks.map((c) => c.blob), { type: chunks[0].blob.type });
    const parts = splitBlob(combined);
    let urls: string[] = [];
    try {
      const { urls: signed } = await requestUploadUrls(sessionId, parts.length, hostToken ?? undefined);
      urls = signed;
    } catch {
      // Backend stub may not be running yet; fallback to placeholder
      urls = parts.map((_, idx) => `https://example.com/upload/${sessionId}/${idx + 1}`);
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
