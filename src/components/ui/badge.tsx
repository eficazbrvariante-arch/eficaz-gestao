import { HTMLAttributes } from "react";
import { clsx } from "@/lib/clsx";

export type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral" | "brand";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  /** Estados informativos neutros (ex.: "novo", "confirmado") — nunca usar pra sucesso/erro. */
  info: "bg-info/10 text-info",
  neutral: "bg-surface-hover text-text-muted",
  brand: "bg-brand/10 text-brand",
};

export function Badge({
  variant = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    />
  );
}
