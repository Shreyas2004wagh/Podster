"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Session } from "@podster/shared";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDownloadUrl, getSession } from "@/lib/api/sessions";

export default function SessionDashboardPage() {
  const params = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    getSession(params.sessionId)
      .then(setSession)
      .catch((err) => setError((err as Error).message));
  }, [params.sessionId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-300">Session</p>
          <h1 className="text-3xl font-semibold text-white">Dashboard {params.sessionId}</h1>
          <p className="text-slate-300">Review tracks and download completed uploads.</p>
        </div>
        <Badge>{session?.status ?? "loading"}</Badge>
      </div>

      {error && <p className="text-sm text-red-200">{error}</p>}

      <Card>
        <h3 className="text-lg font-semibold text-white">Tracks</h3>
        {!session && <p className="text-sm text-slate-300">Loading session...</p>}
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
                  {track.userId} • {track.kind}
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
                      const result = await getDownloadUrl(params.sessionId, track.id);
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
