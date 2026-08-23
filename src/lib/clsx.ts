import { extendTailwindMerge } from "tailwind-merge";

/**
 * `tailwind-merge` sabe resolver classes conflitantes do Tailwind (ex.:
 * `text-black` deve substituir `text-text-secondary`, nunca as duas juntas),
 * mas só conhece a paleta padrão por padrão — os tokens do Design System
 * (`text-foreground`, `bg-surface`, `border-border` etc., ver globals.css)
 * são nomes arbitrários pro Tailwind, então precisam ser registrados aqui
 * pra entrar no mesmo grupo de conflito de "cor de texto"/"cor de fundo"/
 * "cor de borda" das cores nativas. Sem isso, um componente base (`Label`,
 * `Button`...) com token próprio e um `className` de override com uma cor
 * crua (`text-black`) ficam com as duas classes na mesma tag — a que
 * "vence" depende da ordem de geração do CSS, não da ordem no JSX, e o
 * resultado observado foi a cor do token vencendo por engano (texto de
 * rótulo quase invisível apesar do override pedir preto).
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "text-color": [
        "text-foreground",
        "text-background",
        "text-sidebar",
        "text-surface",
        "text-surface-hover",
        "text-surface-elevated",
        "text-border",
        "text-border-active",
        "text-text-secondary",
        "text-text-muted",
        "text-brand",
        "text-brand-hover",
        "text-brand-contrast",
        "text-success",
        "text-warning",
        "text-danger",
        "text-info",
        "text-page",
      ],
      "bg-color": [
        "bg-foreground",
        "bg-background",
        "bg-sidebar",
        "bg-surface",
        "bg-surface-hover",
        "bg-surface-elevated",
        "bg-border",
        "bg-border-active",
        "bg-text-secondary",
        "bg-text-muted",
        "bg-brand",
        "bg-brand-hover",
        "bg-brand-contrast",
        "bg-success",
        "bg-warning",
        "bg-danger",
        "bg-info",
        "bg-page",
      ],
      "border-color": [
        "border-foreground",
        "border-background",
        "border-sidebar",
        "border-surface",
        "border-surface-hover",
        "border-surface-elevated",
        "border-border",
        "border-border-active",
        "border-brand",
        "border-brand-hover",
        "border-success",
        "border-warning",
        "border-danger",
        "border-info",
      ],
    },
  },
});

type ClassValue = string | number | boolean | null | undefined;

export function clsx(...values: ClassValue[]) {
  return twMerge(values.filter(Boolean).join(" "));
}
