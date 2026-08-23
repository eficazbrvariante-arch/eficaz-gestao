import { HTMLAttributes } from "react";
import { clsx } from "@/lib/clsx";

/**
 * Superfície padrão do Design System — substitui o padrão repetido à mão
 * em dezenas de arquivos (`rounded-xl border border-slate-200 bg-white p-5
 * shadow-sm`). Adoção é gradual, tela por tela, conforme cada uma passa
 * pela sua fase — ver docs/DESIGN_SYSTEM_EFICAZ.md.
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("rounded-xl border border-border bg-surface p-5 shadow-sm", className)}
      {...props}
    />
  );
}

/** Título pequeno de seção dentro de um Card (ex.: "Fechar caixa", "Movimentações"). */
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={clsx("mb-4 text-sm font-semibold text-foreground", className)} {...props} />
  );
}
