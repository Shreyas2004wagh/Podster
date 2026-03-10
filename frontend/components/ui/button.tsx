import Link from "next/link";
import {
  type ButtonHTMLAttributes,
  type ComponentProps,
  type MouseEvent,
  type MouseEventHandler,
  type ReactNode
} from "react";
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

interface SharedButtonProps {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

type ButtonAsButtonProps = SharedButtonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof SharedButtonProps | "href"> & {
    as?: "button";
    href?: never;
  };

type ButtonAsLinkProps = SharedButtonProps &
  Omit<ComponentProps<typeof Link>, keyof SharedButtonProps | "href" | "className" | "children" | "onClick"> & {
    as: "a";
    href: ComponentProps<typeof Link>["href"];
    onClick?: MouseEventHandler<HTMLAnchorElement>;
  };

type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

function preventDisabledLinkNavigation(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  event.stopPropagation();
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
}: ButtonProps) {
  const sharedClasses = cn(
    "inline-flex items-center justify-center gap-2 font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
    variants[variant],
    sizes[size],
    loading ? "opacity-70 cursor-not-allowed" : "",
    className
  );

  if (as === "a") {
    const isUnavailable = Boolean(disabled || loading);
    const linkProps = rest as Omit<ButtonAsLinkProps, keyof SharedButtonProps | "as" | "href"> & {
      onClick?: MouseEventHandler<HTMLAnchorElement>;
    };
    const linkHref = href as ComponentProps<typeof Link>["href"];

    return (
      <Link
        href={linkHref}
        aria-disabled={isUnavailable}
        tabIndex={isUnavailable ? -1 : undefined}
        onClick={isUnavailable ? preventDisabledLinkNavigation : linkProps.onClick}
        className={cn(sharedClasses, isUnavailable ? "pointer-events-none" : "")}
        {...linkProps}
      >
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
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
      )}
      {children}
    </button>
  );
}
