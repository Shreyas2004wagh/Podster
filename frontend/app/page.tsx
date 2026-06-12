import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const features = [
  {
    title: "Each voice stays local",
    desc: "Every participant records their own clean track in the browser while the conversation continues live.",
    badge: "Clean tracks"
  },
  {
    title: "Nothing uploads mid-take",
    desc: "Chunks are saved during the session and pushed after stop, so recording quality is not tied to call stability.",
    badge: "After stop"
  },
  {
    title: "Built for recovery",
    desc: "IndexedDB and resumable uploads help sessions survive reloads, retries, and long recording blocks.",
    badge: "Resumable"
  }
];

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <Badge tone="success">Browser studio for remote podcasts</Badge>
          <h1 className="text-4xl font-semibold leading-tight text-white">
            Record every guest locally. Upload only when the take is done.
          </h1>
          <p className="text-lg text-slate-200">
            Podster gives hosts a simple recording room where guests can talk live, capture clean
            browser-side tracks, and recover uploads without interrupting the conversation.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button as="a" href="/sessions/new">
              Create session
            </Button>
            <Button variant="secondary" as="a" href="/sessions/new">
              Start host setup
            </Button>
          </div>
        </div>
        <Card className="border-white/5 bg-white/5">
          <div className="flex flex-col gap-4 text-sm text-slate-200">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">Session flow</span>
              <Badge>Local capture</Badge>
            </div>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span className="mt-0.5 h-2 w-2 rounded-full bg-emerald-400" />
                <div>
                  <p className="font-medium text-white">Join a focused recording room</p>
                  <p className="text-slate-300">
                    Hosts create a session, invite guests, and keep the live conversation lightweight.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 h-2 w-2 rounded-full bg-indigo-400" />
                <div>
                  <p className="font-medium text-white">Capture tracks on each device</p>
                  <p className="text-slate-300">
                    Audio and video chunks are stored locally first, separate from the live call path.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 h-2 w-2 rounded-full bg-amber-400" />
                <div>
                  <p className="font-medium text-white">Upload after the take</p>
                  <p className="text-slate-300">
                    When recording stops, Podster syncs the saved chunks with retry-friendly uploads.
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
              <Badge className="ml-3 shrink-0 whitespace-nowrap">{feature.badge}</Badge>
            </div>
            <p className="text-sm text-slate-300">{feature.desc}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
