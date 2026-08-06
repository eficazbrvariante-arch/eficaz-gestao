"use client";

import { ButtonHTMLAttributes, ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clsx } from "@/lib/clsx";
import { Tooltip } from "@/components/ui/tooltip";

const MENU_WIDTH = 192; // w-48

export function DropdownMenu({
  trigger,
  triggerLabel = "Mais ações",
  children,
  align = "end",
}: {
  trigger: ReactNode;
  triggerLabel?: string;
  children: ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      top: rect.bottom + 4,
      left: align === "end" ? rect.right - MENU_WIDTH : rect.left,
    });
    setOpen(true);
  }

  // Se o menu não couber embaixo do botão até o fim da viewport, abre pra
  // cima em vez de pra baixo — sem isso, itens perto do rodapé da tela
  // ficariam inacessíveis (rolar a página fecha o menu, por design, pra não
  // deixar a posição desatualizada).
  useLayoutEffect(() => {
    if (!open || !menuRef.current || !buttonRef.current) return;
    const menuRect = menuRef.current.getBoundingClientRect();
    if (menuRect.bottom > window.innerHeight) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      setPosition((current) =>
        current ? { ...current, top: buttonRect.top - menuRect.height - 4 } : current
      );
    }
  }, [open]);

  // Renderizado num portal (position: fixed) pra escapar do `overflow-x-auto`
  // do contêiner da tabela — dentro dele, um menu `absolute` normal é cortado
  // pela rolagem, já que o navegador força overflow-y:auto junto do overflow-x.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function handleScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <Tooltip label={triggerLabel}>
        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={triggerLabel}
          onClick={() => (open ? setOpen(false) : openMenu())}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand"
        >
          {trigger}
        </button>
      </Tooltip>
      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            onClick={() => setOpen(false)}
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
            className="fixed z-50 rounded-md border border-slate-200 bg-white py-1 shadow-lg"
          >
            {children}
          </div>,
          document.body
        )}
    </div>
  );
}

export function dropdownItemClassName(danger?: boolean, className?: string) {
  return clsx(
    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent",
    danger ? "text-red-600" : "text-gray-800",
    className
  );
}

export function DropdownMenuItem({
  className,
  danger,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button type="button" role="menuitem" className={dropdownItemClassName(danger, className)} {...props} />
  );
}
