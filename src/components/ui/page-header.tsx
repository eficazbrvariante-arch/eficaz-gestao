import { ReactNode } from "react";
import { clsx } from "@/lib/clsx";

/**
 * Cabeçalho padrão de página do Design System — substitui o bloco repetido
 * à mão em 76+ arquivos (`<h1 className="text-xl font-semibold ...">` +
 * subtítulo + botões de ação). Adoção é gradual, tela por tela, conforme
 * cada uma passa pela sua fase — ver docs/DESIGN_SYSTEM_EFICAZ.md.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("mb-6 flex flex-wrap items-center justify-between gap-3", className)}>
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description && <p className="text-sm text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
