import { LabelHTMLAttributes } from "react";
import { clsx } from "@/lib/clsx";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={clsx("mb-1 block text-sm font-medium text-slate-700", className)}
      {...props}
    />
  );
}
