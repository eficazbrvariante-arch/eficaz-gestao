import { TextareaHTMLAttributes, forwardRef } from "react";
import { clsx } from "@/lib/clsx";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={clsx(
        "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-text-muted focus:border-border-active focus:outline-none focus:ring-1 focus:ring-border-active",
        className
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";
