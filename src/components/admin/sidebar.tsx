"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { clsx } from "@/lib/clsx";
import { navItemsForRole } from "./nav-items";
import { useMobileSidebar } from "./mobile-sidebar-context";
import type { UserRole } from "@/generated/prisma/enums";

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const items = navItemsForRole(role);
  const { isOpen, close } = useMobileSidebar();

  useEffect(() => {
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 md:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-in-out",
          "md:static md:z-auto md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="px-6 py-5 text-lg font-semibold tracking-tight text-slate-900">
          Eficaz Gestão
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6">
          {items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

            if (!item.available) {
              return (
                <span
                  key={item.href}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-slate-400"
                >
                  {item.label}
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">em breve</span>
                </span>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "block rounded-md px-3 py-2 text-sm font-medium",
                  isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
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
