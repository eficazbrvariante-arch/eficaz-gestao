import { ButtonHTMLAttributes, forwardRef } from "react";
import { clsx } from "@/lib/clsx";

type ButtonVariant = "primary" | "secondary" | "ghost" | "brand" | "danger";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  /** Ação de maior destaque neutro — inverte fundo/texto (funciona em claro e escuro sem cor própria). */
  primary: "bg-foreground text-background hover:opacity-90",
  secondary: "bg-surface text-foreground border border-border hover:bg-surface-hover",
  ghost: "bg-transparent text-text-secondary hover:bg-surface-hover",
  /** CTA principal com a cor da marca (ex.: "Novo produto") — a única assinatura verde de destaque. */
  brand: "bg-brand text-brand-contrast hover:bg-brand-hover",
  danger: "bg-danger text-white hover:opacity-90",
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
        "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        fullWidth ? "w-full" : "w-auto",
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    />
  );
});
Button.displayName = "Button";
