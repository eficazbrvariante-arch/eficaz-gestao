"use client";

import { ReactNode, useEffect, useRef } from "react";
import { clsx } from "@/lib/clsx";

/**
 * Modal sobre <dialog> nativo: foco automático, ESC fecha e ::backdrop
 * clicável já vêm de graça do navegador — sem lib de modal/foco.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={clsx(
        // A centralização padrão do <dialog> (via `margin: auto` da UA
        // stylesheet) não sobrevive ao reset de margens do Tailwind —
        // centraliza de novo aqui, de forma explícita.
        "fixed top-1/2 left-1/2 m-0 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface-elevated p-0 shadow-xl backdrop:bg-black/60",
        className
      )}
    >
      <div className="p-5">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
        {children && <div className="mt-4">{children}</div>}
      </div>
      {footer && (
        <div className="flex justify-end gap-2 border-t border-border bg-surface-hover px-5 py-3">
          {footer}
        </div>
      )}
    </dialog>
  );
}
