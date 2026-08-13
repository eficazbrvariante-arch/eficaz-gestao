"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatBRL } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormBanner } from "@/components/ui/form-banner";
import {
  searchCustomersAction,
  getCustomerMergeCandidateAction,
  mergeCustomersAction,
} from "./actions";

type SearchResult = { id: string; name: string; document: string | null; phone: string | null };

type MergeCandidate = {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  creditBalance: number;
  totalSpent: number;
  hasLogin: boolean;
  salesCount: number;
  ordersCount: number;
  fiadoCount: number;
};

export function MergeCustomerPanel({
  customerId,
  customerName,
  customerHasLogin,
}: {
  customerId: string;
  customerName: string;
  customerHasLogin: boolean;
}) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [candidate, setCandidate] = useState<MergeCandidate | null>(null);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [isSearching, startSearch] = useTransition();
  const [isLoadingCandidate, startLoadCandidate] = useTransition();
  const [isMerging, startMerge] = useTransition();

  function search() {
    const query = term.trim();
    if (query.length < 2) return;
    setError(undefined);
    startSearch(async () => {
      const found = await searchCustomersAction(query);
      setResults(found.filter((c) => c.id !== customerId));
    });
  }

  function pickCandidate(id: string) {
    setError(undefined);
    setResults([]);
    setTerm("");
    startLoadCandidate(async () => {
      const found = await getCustomerMergeCandidateAction(id);
      if (!found) {
        setError("Não foi possível carregar esse cadastro.");
        return;
      }
      setCandidate(found);
    });
  }

  function confirmMerge() {
    if (!candidate) return;
    if (candidate.hasLogin && customerHasLogin) {
      setError(
        "Os dois cadastros têm login próprio na loja online — remova o login de um deles antes de mesclar."
      );
      return;
    }
    setError(undefined);
    startMerge(async () => {
      const result = await mergeCustomersAction(customerId, candidate.id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.success) {
        setSuccess(`"${result.mergedName}" foi mesclado em "${result.keptName}".`);
        setCandidate(null);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500">
        Encontrou um cadastro duplicado deste cliente (ex.: um criado no PDV e outro pelo próprio
        cliente no catálogo online)? Busque abaixo — vendas, pedidos, fiado, crédito de loja e
        login são transferidos pra <strong>{customerName}</strong>, e o outro cadastro é apagado.
        Não pode ser desfeito.
      </p>
      <FormBanner message={error} variant="error" />
      <FormBanner message={success} variant="success" />

      {candidate ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-900">
            Mesclar &quot;{candidate.name}&quot; dentro de &quot;{customerName}&quot;?
          </p>
          <ul className="mb-3 space-y-1 text-sm text-amber-900">
            <li>
              Documento: {candidate.document ?? "—"} · Telefone: {candidate.phone ?? "—"}
            </li>
            <li>
              {candidate.salesCount} venda(s) · {candidate.ordersCount} pedido(s) online ·{" "}
              {candidate.fiadoCount} lançamento(s) de fiado
            </li>
            <li>
              Crédito de loja: {formatBRL(candidate.creditBalance)} · Total gasto:{" "}
              {formatBRL(candidate.totalSpent)}
            </li>
            <li>
              {candidate.hasLogin ? "Tem login na loja online" : "Sem login na loja online"}
              {candidate.hasLogin && !customerHasLogin
                ? " — este login será transferido"
                : ""}
            </li>
          </ul>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={isMerging}
              onClick={confirmMerge}
              className="bg-amber-600 px-4 hover:bg-amber-700"
              fullWidth={false}
            >
              {isMerging ? "Mesclando..." : "Confirmar mesclagem"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth={false}
              disabled={isMerging}
              onClick={() => setCandidate(null)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            autoComplete="off"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                search();
              }
            }}
            placeholder="Nome, CPF/CNPJ ou telefone do cadastro duplicado"
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={search}
            fullWidth={false}
            className="shrink-0 px-3"
            disabled={isLoadingCandidate}
          >
            {isSearching ? "Buscando..." : "Buscar"}
          </Button>
        </div>
      )}

      {!candidate && results.length > 0 && (
        <div className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={isLoadingCandidate}
              onClick={() => pickCandidate(c.id)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-medium text-slate-900">{c.name}</span>
              <span className="ml-2 text-xs text-slate-400">{c.document ?? c.phone ?? ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
