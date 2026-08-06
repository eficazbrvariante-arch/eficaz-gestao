"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { clsx } from "@/lib/clsx";

export type SearchableSelectOption = { value: string; label: string };

/**
 * Campo de busca com filtro em tempo real por texto, pra escolher um item de
 * uma lista longa sem depender de rolar um `<select>` inteiro. Controlado
 * (value/onChange), pra ser ligado a um formulário via `setValue`/`watch` —
 * mesmo padrão de `ImageUploadField`.
 */
export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Digite para buscar...",
  emptyLabel = "Nenhum produto encontrado",
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const blurTimeout = useRef<number | undefined>(undefined);
  const listboxId = useId();

  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  useEffect(() => {
    return () => window.clearTimeout(blurTimeout.current);
  }, []);

  function handleSelect(option: SearchableSelectOption) {
    onChange(option.value);
    setQuery("");
    setOpen(false);
  }

  function handleClear() {
    onChange("");
    setQuery("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true);
        setHighlighted(0);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setHighlighted((i) => Math.max(i - 1, 0));
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (filtered[highlighted]) handleSelect(filtered[highlighted]);
      e.preventDefault();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={clsx("relative", className)}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
        autoComplete="off"
        value={open ? query : (selected?.label ?? "")}
        onFocus={() => {
          window.clearTimeout(blurTimeout.current);
          setQuery("");
          setOpen(true);
          setHighlighted(0);
        }}
        onBlur={() => {
          blurTimeout.current = window.setTimeout(() => setOpen(false), 150);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlighted(0);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={clsx(
          "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500",
          selected && !open && "pr-8"
        )}
      />

      {selected && !open && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleClear}
          aria-label="Limpar seleção"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          ×
        </button>
      )}

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">{emptyLabel}</li>
          )}
          {filtered.map((option, index) => (
            <li key={option.value} role="option" aria-selected={option.value === value}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(option)}
                className={clsx(
                  "block w-full px-3 py-2 text-left text-sm",
                  index === highlighted ? "bg-slate-100" : "hover:bg-slate-50",
                  option.value === value && "font-medium text-slate-900"
                )}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
