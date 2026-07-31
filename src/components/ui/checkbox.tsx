import { InputHTMLAttributes, forwardRef } from "react";
import { clsx } from "@/lib/clsx";

export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type">
>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={clsx(
        "h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500",
        className
      )}
      {...props}
    />
  );
});
Checkbox.displayName = "Checkbox";
