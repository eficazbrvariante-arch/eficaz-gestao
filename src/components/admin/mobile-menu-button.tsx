"use client";

import { useMobileSidebar } from "./mobile-sidebar-context";

export function MobileMenuButton() {
  const { open } = useMobileSidebar();

  return (
    <button
      type="button"
      onClick={open}
      className="mr-3 rounded-md border border-border p-2 text-text-secondary hover:bg-surface-hover md:hidden"
      aria-label="Abrir menu de navegação"
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
  );
}
