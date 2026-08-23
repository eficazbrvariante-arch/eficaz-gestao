"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "@/lib/clsx";

const PAGE_SIZE_OPTIONS = [20, 50, 100];

/** Janela de números ao redor da página atual, com "..." quando há salto. */
function pageWindow(current: number, total: number): (number | "...")[] {
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);

  const result: (number | "...")[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) result.push("...");
    result.push(page);
    previous = page;
  }
  return result;
}

export function Pagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  function go(nextPage: number, nextPageSize: number = pageSize) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    params.set("pageSize", String(nextPageSize));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row">
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <span>
          Exibindo {from}–{to} de {total} produtos
        </span>
        <label className="ml-2 flex items-center gap-1.5">
          <span className="hidden sm:inline">por página</span>
          <select
            value={pageSize}
            onChange={(event) => go(1, Number(event.target.value))}
            className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            aria-label="Itens por página"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <nav className="flex items-center gap-1" aria-label="Paginação">
        <button
          type="button"
          onClick={() => go(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pageWindow(page, totalPages).map((entry, index) =>
          entry === "..." ? (
            <span key={`ellipsis-${index}`} className="px-1 text-sm text-text-muted">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              onClick={() => go(entry)}
              aria-current={entry === page ? "page" : undefined}
              className={clsx(
                "flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-medium",
                entry === page ? "bg-brand text-brand-contrast" : "text-text-secondary hover:bg-surface-hover"
              )}
            >
              {entry}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => go(page + 1)}
          disabled={page >= totalPages}
          aria-label="Próxima página"
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>
    </div>
  );
}
