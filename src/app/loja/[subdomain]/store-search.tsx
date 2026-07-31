"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function StoreSearch({ base }: { base: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [term, setTerm] = useState(searchParams.get("q") ?? "");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const query = term.trim();
    router.push(query ? `${base}/produtos?q=${encodeURIComponent(query)}` : `${base}/produtos`);
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        type="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="O que você procura?"
        aria-label="Buscar produtos"
        className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      />
      <button
        type="submit"
        className="shrink-0 rounded-md px-4 py-2 text-sm font-medium text-white"
        style={{ backgroundColor: "var(--store-primary)" }}
      >
        Buscar
      </button>
    </form>
  );
}
