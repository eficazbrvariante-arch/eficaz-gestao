import { InputHTMLAttributes, forwardRef } from "react";
import { clsx } from "@/lib/clsx";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={clsx(
          "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-text-muted focus:border-border-active focus:outline-none focus:ring-1 focus:ring-border-active",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
