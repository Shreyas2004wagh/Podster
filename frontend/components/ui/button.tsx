import Link from "next/link";
import { type ButtonHTMLAttributes, type PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-500 hover:bg-brand-600 text-white shadow-sm hover:shadow-md transition-shadow",
  secondary:
    "bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-colors",
  ghost: "bg-transparent hover:bg-white/5 text-white border border-transparent",
  danger:
    "bg-red-500/90 hover:bg-red-500 text-white shadow-sm hover:shadow-md transition-shadow"
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm rounded-lg",
  md: "px-4 py-2 text-sm rounded-lg",
  lg: "px-5 py-2.5 text-base rounded-xl"
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  as?: "button" | "a";
  href?: string;
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  disabled,
  className,
  as = "button",
  href,
  children,
  ...rest
}: PropsWithChildren<ButtonProps>) {
  const sharedClasses = cn(
    "inline-flex items-center justify-center gap-2 font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
    variants[variant],
    sizes[size],
    loading ? "opacity-70 cursor-not-allowed" : "",
    className
  );

  if (as === "a" && href) {
    return (
      <Link href={href} className={sharedClasses}>
        {loading && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
        )}
        {children}
      </Link>
    );
  }

  return (
    <button
      className={sharedClasses}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
      )}
      {children}
    </button>
  );
}
