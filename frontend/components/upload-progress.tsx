import { Badge } from "@/components/ui/badge";

export interface UploadItem {
  id: string;
  filename: string;
  progress: number; // 0-100
  status: "pending" | "uploading" | "completed" | "error";
  errorMessage?: string;
}

interface UploadProgressProps {
  items: UploadItem[];
}

export function UploadProgress({ items }: UploadProgressProps) {
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-300">
        Uploads will appear here after recording stops.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-inner"
        >
          <div className="mb-2 flex items-center justify-between text-sm text-slate-200">
            <span className="font-medium">{item.filename}</span>
            <Badge tone={item.status === "completed" ? "success" : "default"}>
              {item.status}
            </Badge>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${item.progress}%` }}
            />
          </div>
          {item.errorMessage && (
            <p className="mt-2 text-xs text-red-200">Error: {item.errorMessage}</p>
          )}
        </div>
      ))}
    </div>
  );
}
