"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinSession } from "@/lib/api/sessions";

export default function JoinSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = async () => {
    setIsJoining(true);
    setError(null);
    try {
      const response = await joinSession(params.sessionId, { guestName: name });
      router.push(`/sessions/${params.sessionId}/record`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-wide text-slate-300">Guest</p>
        <h1 className="text-3xl font-semibold text-white">Join session {params.sessionId}</h1>
        <p className="text-slate-300">
          Provide your name to receive a signed guest token. Recording still happens locally.
        </p>
      </div>
      <Card>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Display name</Label>
            <Input
              id="name"
              placeholder="Guest name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-200">{error}</p>}
          <Button onClick={handleJoin} loading={isJoining} disabled={!name}>
            Join recording room
          </Button>
        </div>
      </Card>
    </div>
  );
}
