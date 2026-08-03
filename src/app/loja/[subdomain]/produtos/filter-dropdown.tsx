"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { clsx } from "@/lib/clsx";

export function FilterDropdown({ label, children }: { label: string; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        {label}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={clsx("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-180")}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute left-0 top-full z-30 mt-1 w-64 max-w-[85vw] rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
          // Selecionar um link (opção de ordenação ou marca) fecha o menu;
          // cliques em outros elementos (como o campo de busca de marca) não fecham.
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setIsOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
