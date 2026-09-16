"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL } from "@/lib/format";
import { searchCustomersAction } from "../clientes/actions";

/** Mesmo formato devolvido por `searchCustomersAction` (ver `clientes/actions.ts`). */
export type CustomerOption = {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  creditBalance: number;
  eficazNumber: string | null;
  creditoEficazAvailableAmount: number;
  creditoEficazBlocked: boolean;
};

/**
 * Identificar o cliente sem gastar altura da tela principal do PDV.
 *
 * A busca é exatamente a mesma de antes (`searchCustomersAction`: nome,
 * CPF/CNPJ, telefone ou Número Eficaz) — só saiu de um painel sempre aberto
 * na lateral e virou um modal, aberto pelo card "Cliente". Nenhuma regra de
 * crédito/fiado mudou: quem decide o que o cliente pode usar continua sendo
 * o `PdvScreen`.
 */
export function CustomerPickerModal({
  open,
  onClose,
  selected,
  onSelect,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  selected: CustomerOption | null;
  onSelect: (customer: CustomerOption) => void;
  /** Volta a venda pra "não identificado" (o `PdvScreen` realoca os pagamentos). */
  onClear: () => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<CustomerOption[]>([]);
  /** Termo que de fato gerou `results` — não o que está digitado agora. */
  const [searchedTerm, setSearchedTerm] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Cada abertura começa limpa — o resultado da venda anterior não fica preso
  // na lista. Ajuste durante a renderização (não num efeito, mesmo padrão de
  // `syncedAllocationSignature` em `pdv-screen.tsx`): evita o render extra que
  // um `useEffect` + `setState` causaria a cada abrir/fechar.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTerm("");
      setResults([]);
      setSearchedTerm(null);
    }
  }

  // Foco no campo é efeito no DOM, não estado — o operador já sai digitando.
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  function search() {
    const query = term.trim();
    if (query.length < 2) return;
    startTransition(async () => {
      setResults(await searchCustomersAction(query));
      setSearchedTerm(query);
    });
  }

  /** Digitou de novo: a lista anterior é de outra busca e não pode continuar
   *  clicável — um clique ali selecionaria o cliente errado, com o campo já
   *  mostrando outro nome. */
  function changeTerm(value: string) {
    setTerm(value);
    if (searchedTerm !== null && value.trim() !== searchedTerm) {
      setResults([]);
      setSearchedTerm(null);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Cliente da venda"
      description="Busque por nome, CPF/CNPJ, telefone ou Número Eficaz. A venda pode seguir sem cliente identificado."
      footer={
        <>
          {selected && (
            <Button
              type="button"
              variant="secondary"
              fullWidth={false}
              onClick={() => {
                onClear();
                onClose();
              }}
            >
              Remover cliente
            </Button>
          )}
          <Button type="button" variant="secondary" fullWidth={false} onClick={onClose}>
            Fechar
          </Button>
        </>
      }
    >
      {selected && (
        <div className="mb-4 rounded-md border border-border bg-surface-hover px-3 py-2">
          <p className="text-xs text-text-muted">Cliente atual</p>
          <p className="text-base font-bold text-foreground">{selected.name}</p>
          <p className="text-xs text-text-muted">
            {selected.document ?? selected.phone ?? "sem documento"}
            {selected.eficazNumber ? ` · ${selected.eficazNumber}` : ""}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Input
          id="pdv-customer"
          ref={inputRef}
          autoComplete="off"
          value={term}
          onChange={(e) => changeTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder="Nome, CPF/CNPJ, telefone ou Número Eficaz"
          className="min-w-0 flex-1"
        />
        <Button type="button" variant="secondary" onClick={search} fullWidth={false} className="shrink-0 px-3">
          {isPending ? "Buscando..." : "Buscar"}
        </Button>
      </div>

      {results.length > 0 && (
        <div className="mt-3 max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {results.map((customer) => (
            <button
              key={customer.id}
              type="button"
              onClick={() => {
                onSelect(customer);
                onClose();
              }}
              className="block w-full px-3 py-2.5 text-left hover:bg-surface-hover"
            >
              <span className="block text-sm font-medium text-foreground">{customer.name}</span>
              <span className="block text-xs text-text-muted">
                {customer.document ?? customer.phone ?? "sem documento"}
                {customer.eficazNumber ? ` · ${customer.eficazNumber}` : ""}
              </span>
              {customer.creditBalance > 0 && (
                <span className="block text-xs font-medium text-success">
                  Crédito de loja: {formatBRL(customer.creditBalance)}
                </span>
              )}
              {customer.creditoEficazAvailableAmount > 0 && !customer.creditoEficazBlocked && (
                <span className="block text-xs font-medium text-success">
                  Crédito Eficaz: {formatBRL(customer.creditoEficazAvailableAmount)}
                </span>
              )}
              {customer.creditoEficazBlocked && (
                <span className="block text-xs font-medium text-danger">Crédito Eficaz bloqueado</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Cita o termo REALMENTE pesquisado — com o termo digitado agora, o
          aviso passaria a mentir assim que o operador começasse a redigitar. */}
      {searchedTerm !== null && !isPending && results.length === 0 && (
        <p className="mt-3 text-sm text-text-muted">
          Nenhum cliente encontrado para &ldquo;{searchedTerm}&rdquo;.
        </p>
      )}
    </Dialog>
  );
}
