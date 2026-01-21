import { cn } from "@/lib/utils";
import type { LabelHTMLAttributes, PropsWithChildren } from "react";

type LabelProps = PropsWithChildren<LabelHTMLAttributes<HTMLLabelElement>>;

export function Label({ className, children, ...props }: LabelProps) {
  return (
    <label className={cn("text-sm font-medium text-slate-200", className)} {...props}>
      {children}
    </label>
  );
}
