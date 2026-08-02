"use client";

import { useState } from "react";
import Link from "next/link";
import { clsx } from "@/lib/clsx";

export function MobileCategoryMenu({
  base,
  categories,
}: {
  base: string;
  categories: { id: string; name: string }[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (categories.length === 0) return null;

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-md border border-slate-300 p-2 text-slate-700 hover:bg-slate-50"
        aria-label="Abrir menu de categorias"
        aria-expanded={isOpen}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        className={clsx(
          "fixed right-0 top-0 z-50 max-h-[75vh] w-64 max-w-[80vw] overflow-y-auto rounded-bl-xl border-b border-l border-slate-200 bg-white shadow-xl transition-transform duration-200 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Categorias"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <span className="text-sm font-semibold text-slate-900">Categorias</span>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Fechar menu de categorias"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <ul className="space-y-1 p-2 text-sm">
          <li>
            <Link
              href={`${base}/produtos`}
              onClick={() => setIsOpen(false)}
              className="block rounded-md px-3 py-2 text-slate-700 hover:bg-slate-50"
            >
              Todos os produtos
            </Link>
          </li>
          {categories.map((category) => (
            <li key={category.id}>
              <Link
                href={`${base}/produtos?categoria=${category.id}`}
                onClick={() => setIsOpen(false)}
                className="block rounded-md px-3 py-2 text-slate-700 hover:bg-slate-50"
              >
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
