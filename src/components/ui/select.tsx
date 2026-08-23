import { SelectHTMLAttributes, forwardRef } from "react";
import { clsx } from "@/lib/clsx";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={clsx(
          "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-border-active focus:outline-none focus:ring-1 focus:ring-border-active",
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = "Select";
