import { cn } from "@/lib/utils";
import type { PropsWithChildren } from "react";

interface BadgeProps extends PropsWithChildren {
  tone?: "default" | "success" | "warning";
  className?: string;
}

const tones = {
  default: "bg-white/10 text-white border border-white/10",
  success: "bg-emerald-500/15 text-emerald-100 border border-emerald-400/30",
  warning: "bg-amber-500/15 text-amber-100 border border-amber-400/30"
};

export function Badge({ tone = "default", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
