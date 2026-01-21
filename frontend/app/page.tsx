import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const features = [
  {
    title: "Local-first recording",
    desc: "MediaRecorder captures locally; uploads only start after you stop.",
    badge: "Lossless & resilient"
  },
  {
    title: "Parallel, resumable uploads",
    desc: "Chunked uploads fan out via worker + IndexedDB to survive refreshes.",
    badge: "Worker + IndexedDB"
  },
  {
    title: "Separate from WebRTC",
    desc: "Live comms stay in WebRTC; recording stays local per browser.",
    badge: "No SFU coupling"
  }
];

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <Badge tone="success">MVP scope, production habits</Badge>
          <h1 className="text-4xl font-semibold leading-tight text-white">
            Riverside-style remote podcasting with local capture.
          </h1>
          <p className="text-lg text-slate-200">
            Podster keeps live calls and recording isolated. We capture locally, persist chunks in
            IndexedDB, then upload in parallel only after you stop.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button as="a" href="/sessions/new">
              Create session
            </Button>
            <Button variant="secondary" as="a" href="/sessions/demo-record">
              Jump to recording room
            </Button>
          </div>
        </div>
        <Card className="border-white/5 bg-white/5">
          <div className="flex flex-col gap-4 text-sm text-slate-200">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">Architecture snapshot</span>
              <Badge>Local & async</Badge>
            </div>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span className="mt-0.5 h-2 w-2 rounded-full bg-emerald-400" />
                <div>
                  <p className="font-medium text-white">Local recording pipeline</p>
                  <p className="text-slate-300">
                    MediaRecorder → IndexedDB chunks → upload worker after stop.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 h-2 w-2 rounded-full bg-indigo-400" />
                <div>
                  <p className="font-medium text-white">WebRTC isolation</p>
                  <p className="text-slate-300">
                    Signaling client is separate; no SFU coupling in recording code.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 h-2 w-2 rounded-full bg-amber-400" />
                <div>
                  <p className="font-medium text-white">Resumable uploads</p>
                  <p className="text-slate-300">
                    Upload worker fans out chunk PUTs; retries and signed URLs sit behind the API.
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {features.map((feature) => (
          <Card key={feature.title} className="border-white/5 bg-white/5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
              <Badge>{feature.badge}</Badge>
            </div>
            <p className="text-sm text-slate-300">{feature.desc}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
