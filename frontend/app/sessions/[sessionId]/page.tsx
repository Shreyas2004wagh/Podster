"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { Session } from "@podster/shared";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { finishSession, getDownloadUrl, getRecordingUrl, getSession } from "@/lib/api/sessions";
import { getViewerSession } from "@/lib/session/viewer";

export default function SessionDashboardPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId ?? "";
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const loadSessionAbortRef = useRef<AbortController | null>(null);
  const isRefreshingRef = useRef(false);

  const completedTrackCount = useMemo(
    () => session?.tracks?.filter((track) => Boolean(track.completedAt)).length ?? 0,
    [session]
  );
  const showFinishControl =
    viewerId !== null && viewerId === session?.hostId && session.status.toLowerCase() !== "complete";
  const uploadsReady = completedTrackCount > 0 && completedTrackCount === session?.tracks?.length;

  async function handleFinish() {
    if (!window.confirm("Has everyone finished uploading? Finishing closes this session to new uploads and guests.")) {
      return;
    }

    setIsFinishing(true);
    setFinishError(null);
    try {
      const finished = await finishSession(sessionId);
      loadSessionAbortRef.current?.abort();
      setSession(finished);
    } catch (err) {
      setFinishError((err as Error).message);
      void loadSession(true);
    } finally {
      setIsFinishing(false);
    }
  }

  const loadSession = useCallback(
    async (showSpinner: boolean) => {
      if (!sessionId) return;

      if (!showSpinner && isRefreshingRef.current) {
        isRefreshingRef.current = false;
        setIsRefreshing(false);
      }

      loadSessionAbortRef.current?.abort();
      const controller = new AbortController();
      loadSessionAbortRef.current = controller;

      if (showSpinner) {
        isRefreshingRef.current = true;
        setIsRefreshing(true);
      }

      try {
        setError(null);
        const nextSession = await getSession(sessionId, { signal: controller.signal });
        if (controller.signal.aborted) {
          return;
        }
        setSession(nextSession);
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        setError((err as Error).message);
      } finally {
        if (loadSessionAbortRef.current === controller) {
          loadSessionAbortRef.current = null;
        }
        if (showSpinner && !controller.signal.aborted && isRefreshingRef.current) {
          isRefreshingRef.current = false;
          setIsRefreshing(false);
        }
      }
    },
    [sessionId]
  );

  useEffect(() => {
    if (!sessionId) return;

    setViewerId(getViewerSession(sessionId)?.userId ?? null);
    void loadSession(true);
    const interval = window.setInterval(() => {
      void loadSession(false);
    }, 15_000);

    return () => {
      loadSessionAbortRef.current?.abort();
      window.clearInterval(interval);
    };
  }, [loadSession, sessionId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-300">Session</p>
          <h1 className="text-3xl font-semibold text-white">Dashboard {sessionId}</h1>
          <p className="text-slate-300">Review tracks and download completed uploads.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{session?.status ?? "loading"}</Badge>
          <Button variant="ghost" size="sm" onClick={() => void loadSession(true)} disabled={!sessionId || isRefreshing || isFinishing}>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={completedTrackCount === 0}
            onClick={async () => {
              try {
                setDownloadError(null);
                const result = await getRecordingUrl(sessionId);
                window.open(result.url, "_blank", "noopener,noreferrer");
              } catch (err) {
                setDownloadError((err as Error).message);
              }
            }}
          >
            Open latest recording
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-200">{error}</p>}

      {showFinishControl && (
        <Card>
          <p className="mb-3 text-sm text-slate-300">
            Confirm everyone has uploaded their recordings before finishing the session.
          </p>
          <Button
            disabled={isRefreshing || isFinishing || !uploadsReady}
            onClick={() => void handleFinish()}
          >
            {isFinishing ? "Finishing..." : "Finish session"}
          </Button>
          {finishError && <p role="alert" className="mt-3 text-sm text-red-200">{finishError}</p>}
        </Card>
      )}

      <Card>
        <h3 className="text-lg font-semibold text-white">Tracks</h3>
        {!session && <p className="text-sm text-slate-300">Loading session...</p>}
        {session && (
          <p className="mt-2 text-sm text-slate-300">
            {completedTrackCount} completed track{completedTrackCount === 1 ? "" : "s"} available.
          </p>
        )}
        {session?.tracks?.length === 0 && (
          <p className="text-sm text-slate-300">No tracks yet. Record to create uploads.</p>
        )}
        <div className="mt-3 space-y-3">
          {session?.tracks?.map((track) => (
            <div
              key={track.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
            >
              <div>
                <p className="font-semibold text-white">
                  {track.userId} - {track.kind}
                </p>
                <p className="text-sm text-slate-300">Object key: {track.objectKey}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={track.completedAt ? "success" : "default"}>
                  {track.completedAt ? "Uploaded" : "Pending"}
                </Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!track.completedAt}
                  onClick={async () => {
                    try {
                      setDownloadError(null);
                      const result = await getDownloadUrl(sessionId, track.id);
                      window.open(result.url, "_blank", "noopener,noreferrer");
                    } catch (err) {
                      setDownloadError((err as Error).message);
                    }
                  }}
                >
                  Download
                </Button>
              </div>
            </div>
          ))}
        </div>
        {downloadError && <p className="mt-3 text-sm text-red-200">{downloadError}</p>}
      </Card>
    </div>
  );
}
