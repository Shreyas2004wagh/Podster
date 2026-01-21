import { cn } from "@/lib/utils";
import type { PropsWithChildren } from "react";

interface CardProps extends PropsWithChildren {
  className?: string;
}

export function Card({ className, children }: CardProps) {
  return (
    <div className={cn("glass rounded-2xl border border-white/5 p-6 shadow-card", className)}>
      {children}
    </div>
  );
}
