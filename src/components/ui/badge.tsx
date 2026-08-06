import { HTMLAttributes } from "react";
import { clsx } from "@/lib/clsx";

type BadgeVariant = "success" | "warning" | "danger" | "neutral" | "brand";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  neutral: "bg-slate-100 text-slate-500",
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
