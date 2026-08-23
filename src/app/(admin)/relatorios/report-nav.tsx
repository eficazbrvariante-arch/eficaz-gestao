"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "@/lib/clsx";
import { periodShortcuts } from "./period";
import type { Period } from "@/modules/reports/report-service";

const TABS = [
  { label: "Vendas", href: "/relatorios" },
  { label: "Produtos", href: "/relatorios/produtos" },
  { label: "Caixa", href: "/relatorios/caixa" },
];

/** Abas dos relatórios, preservando o período selecionado ao trocar de aba. */
export function ReportTabs({ period }: { period: Period }) {
  const pathname = usePathname();
  const query = `?de=${period.from}&ate=${period.to}`;

  return (
    <div className="mb-4 flex gap-2 border-b border-slate-200">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={`${tab.href}${query}`}
            className={clsx(
              "border-b-2 px-3 py-2 text-sm font-medium",
              isActive
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-700 hover:text-slate-900"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

export function PeriodPicker({
  period,
  extraParams,
}: {
  period: Period;
  /** Outros parâmetros da URL (ex.: busca) a preservar ao aplicar o período. */
  extraParams?: Record<string, string | undefined>;
}) {
  const pathname = usePathname();
  const shortcuts = periodShortcuts();
  const extraQuery = Object.entries(extraParams ?? {})
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${encodeURIComponent(value!)}`)
    .join("&");

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-4">
        <form className="flex flex-wrap items-end gap-3">
          {Object.entries(extraParams ?? {})
            .filter(([, value]) => value)
            .map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
          <div>
            <label htmlFor="de" className="mb-1 block text-xs font-medium text-slate-900">
              De
            </label>
            <input
              type="date"
              id="de"
              name="de"
              defaultValue={period.from}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="ate" className="mb-1 block text-xs font-medium text-slate-900">
              Até
            </label>
            <input
              type="date"
              id="ate"
              name="ate"
              defaultValue={period.to}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Aplicar
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          {shortcuts.map((shortcut) => {
            const isActive = period.from === shortcut.from && period.to === shortcut.to;
            return (
              <Link
                key={shortcut.label}
                href={`${pathname}?de=${shortcut.from}&ate=${shortcut.to}${extraQuery ? `&${extraQuery}` : ""}`}
                className={clsx(
                  "rounded-full px-3 py-1.5 text-xs",
                  isActive
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 text-slate-800 hover:bg-slate-50"
                )}
              >
                {shortcut.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Botão de exportação, que carrega o relatório e o período atuais. */
export function ExportButton({ report, period }: { report: string; period: Period }) {
  return (
    <Link
      href={`/relatorios/exportar?relatorio=${report}&de=${period.from}&ate=${period.to}`}
      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      Exportar CSV
    </Link>
  );
}
