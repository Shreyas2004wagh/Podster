"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TextArea } from "@/components/ui/textarea";
import { createSession } from "@/lib/api/sessions";

export default function CreateSessionPage() {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleCreate = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await createSession({ title });
      // We keep notes client-side for now; backend stub does not store them.
      router.push(`/sessions/${result.session.id}/record`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-wide text-slate-300">Host</p>
        <h1 className="text-3xl font-semibold text-white">Create a new session</h1>
        <p className="text-slate-300">
          Generates a host JWT and a signed guest token via the backend stub.
        </p>
      </div>

      <Card>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Session title</Label>
            <Input
              id="title"
              placeholder="Interview with Jane"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (local only)</Label>
            <TextArea
              id="notes"
              placeholder="Talking points..."
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-200">{error}</p>}
          <Button onClick={handleCreate} loading={isSubmitting} disabled={!title}>
            Create and enter room
          </Button>
        </div>
      </Card>
    </div>
  );
}
