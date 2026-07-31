import { ButtonHTMLAttributes, forwardRef } from "react";
import { clsx } from "@/lib/clsx";

type ButtonVariant = "primary" | "secondary" | "ghost";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-400",
  secondary: "bg-white text-slate-900 border border-slate-300 hover:bg-slate-50",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100",
};

/**
 * A largura é controlada por `fullWidth`, não por classe.
 * Passar `w-auto` via `className` não funcionaria: o Tailwind resolve conflitos
 * pela ordem na folha de estilo, e `w-full` venceria de qualquer forma.
 */
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    fullWidth?: boolean;
  }
>(({ className, variant = "primary", fullWidth = true, disabled, ...props }, ref) => {
  return (
    <button
      ref={ref}
      disabled={disabled}
      className={clsx(
        "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed",
        fullWidth ? "w-full" : "w-auto",
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    />
  );
});
Button.displayName = "Button";
