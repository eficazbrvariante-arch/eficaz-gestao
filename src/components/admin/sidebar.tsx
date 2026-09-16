"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { clsx } from "@/lib/clsx";
import { navItemsForRole } from "./nav-items";
import { useMobileSidebar } from "./mobile-sidebar-context";
import type { UserRole } from "@/generated/prisma/enums";

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const items = navItemsForRole(role);
  const { isOpen, close, isCollapsed, toggleCollapsed } = useMobileSidebar();

  useEffect(() => {
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {isOpen && (
        <div
          className={clsx(
            "fixed inset-0 z-40 bg-slate-900/40",
            // Recolhido, a gaveta (e o véu atrás dela) também valem no desktop.
            !isCollapsed && "md:hidden"
          )}
          onClick={close}
          aria-hidden="true"
        />
      )}
      <aside
        // Recolhido e fechado, a barra fica fora da tela em QUALQUER largura —
        // sem `inert`, quem navega por teclado sairia do botão de menu e
        // passaria por ~20 links invisíveis antes de chegar ao conteúdo. Nunca
        // vale quando está expandida (aí ela é coluna visível do layout).
        inert={isCollapsed && !isOpen}
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-border bg-sidebar transition-transform duration-200 ease-in-out print:hidden",
          // Expandido, vira coluna fixa do layout a partir de `md`. Recolhido,
          // continua sendo a gaveta sobreposta em qualquer largura — é o que
          // devolve os 256px de largura pro conteúdo (ex.: o PDV).
          !isCollapsed && "md:static md:z-auto md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between gap-2 px-6 py-5">
          <span className="text-lg font-semibold tracking-tight text-foreground">Eficaz Gestão</span>
          <button
            type="button"
            onClick={() => {
              close();
              toggleCollapsed();
            }}
            title={
              isCollapsed
                ? "Fixar o menu de volta ao lado do conteúdo"
                : "Recolher menu — reabre pelo botão de menu na barra de cima"
            }
            aria-label={isCollapsed ? "Fixar menu de navegação" : "Recolher menu de navegação"}
            className="hidden shrink-0 rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-foreground md:block"
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6">
          {items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

            if (!item.available) {
              return (
                <span
                  key={item.href}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-text-muted"
                >
                  {item.label}
                  <span className="rounded bg-surface-hover px-1.5 py-0.5 text-xs">em breve</span>
                </span>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "block rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
                  isActive
                    ? "bg-brand text-brand-contrast"
                    : "text-text-secondary hover:bg-surface-hover"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
