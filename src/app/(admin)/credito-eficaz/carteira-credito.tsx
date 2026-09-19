"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FormBanner } from "@/components/ui/form-banner";
import { formatBRL } from "@/lib/format";
import type { CreditCustomerRow } from "@/modules/credito-eficaz/credito-eficaz-service";
import type { BulkLimitPreview } from "@/modules/credito-eficaz/convenio-credit-service";
import { previewBulkCreditoEficazLimitAction, applyBulkCreditoEficazLimitAction } from "./actions";

type SourceFilter = "ALL" | "MANUAL" | "CONVENIO";
type StatusFilter = "ALL" | "ACTIVE" | "BLOCKED" | "CURRENT" | "OVERDUE";

const SOURCE_LABEL: Record<SourceFilter, string> = {
  ALL: "Todos",
  MANUAL: "Crédito Eficaz normal",
  CONVENIO: "Convênio",
};

const STATUS_LABEL: Record<StatusFilter, string> = {
  ALL: "Todos",
  ACTIVE: "Usando agora",
  BLOCKED: "Bloqueados",
  CURRENT: "Em dia",
  OVERDUE: "Com parcela vencida",
};

/**
 * Carteira do Crédito Eficaz inteira (normal + convênio) com filtros e a
 * alteração de limite em massa. Os filtros são locais — a lista já chega
 * completa do servidor, e o volume do piloto não justifica ida e volta.
 */
export function CarteiraCredito({
  rows,
  convenios,
}: {
  rows: CreditCustomerRow[];
  convenios: { id: string; name: string }[];
}) {
  const [source, setSource] = useState<SourceFilter>("ALL");
  const [convenioId, setConvenioId] = useState<string>("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (source !== "ALL" && row.source !== source) return false;
      if (convenioId && row.convenioName !== convenios.find((c) => c.id === convenioId)?.name) return false;
      switch (status) {
        case "ACTIVE":
          return row.usedAmount > 0 || row.openAmount > 0;
        case "BLOCKED":
          return row.blocked;
        case "CURRENT":
          return row.overdueAmount <= 0;
        case "OVERDUE":
          return row.overdueAmount > 0;
        default:
          return true;
      }
    });
  }, [rows, source, convenioId, status, convenios]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, row) => ({
          limit: acc.limit + row.limitAmount,
          used: acc.used + row.usedAmount,
          available: acc.available + row.availableAmount,
          open: acc.open + row.openAmount,
          overdue: acc.overdue + row.overdueAmount,
        }),
        { limit: 0, used: 0, available: 0, open: 0, overdue: 0 }
      ),
    [filtered]
  );

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    setSelected(
      selected.size === filtered.length ? new Set() : new Set(filtered.map((row) => row.id))
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Carteira do Crédito Eficaz</h2>
        <p className="mt-1 text-xs text-slate-500">
          Clientes com limite ou obrigação registrada — os dois caminhos (fluxo normal e convênio) na
          mesma lista.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <Label htmlFor="ce-filter-source">Origem</Label>
          <select
            id="ce-filter-source"
            value={source}
            onChange={(e) => setSource(e.target.value as SourceFilter)}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm"
          >
            {(Object.keys(SOURCE_LABEL) as SourceFilter[]).map((key) => (
              <option key={key} value={key}>
                {SOURCE_LABEL[key]}
              </option>
            ))}
          </select>
        </div>
        {convenios.length > 0 && (
          <div>
            <Label htmlFor="ce-filter-convenio">Convênio</Label>
            <select
              id="ce-filter-convenio"
              value={convenioId}
              onChange={(e) => setConvenioId(e.target.value)}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            >
              <option value="">Todos</option>
              {convenios.map((convenio) => (
                <option key={convenio.id} value={convenio.id}>
                  {convenio.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <Label htmlFor="ce-filter-status">Situação</Label>
          <select
            id="ce-filter-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm"
          >
            {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((key) => (
              <option key={key} value={key}>
                {STATUS_LABEL[key]}
              </option>
            ))}
          </select>
        </div>
        <p className="ml-auto text-xs text-slate-500">
          {filtered.length} cliente(s) · limite {formatBRL(totals.limit)} · utilizado{" "}
          {formatBRL(totals.used)} · disponível {formatBRL(totals.available)} · em aberto{" "}
          {formatBRL(totals.open)} · vencido {formatBRL(totals.overdue)}
        </p>
      </div>

      <BulkLimitForm
        convenios={convenios}
        selectedIds={[...selected]}
        onDone={() => setSelected(new Set())}
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">
                <input
                  type="checkbox"
                  aria-label="Selecionar todos"
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-4 py-2 font-medium">Cliente</th>
              <th className="px-4 py-2 font-medium">Origem</th>
              <th className="px-4 py-2 font-medium">Limite</th>
              <th className="px-4 py-2 font-medium">Disponível</th>
              <th className="px-4 py-2 font-medium">Utilizado</th>
              <th className="px-4 py-2 font-medium">Em aberto</th>
              <th className="px-4 py-2 font-medium">Vencido</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${row.name}`}
                    checked={selected.has(row.id)}
                    onChange={() => toggle(row.id)}
                  />
                </td>
                <td className="px-4 py-2">
                  <Link href={`/clientes/${row.id}`} className="text-slate-900 hover:underline">
                    {row.name}
                  </Link>
                  {row.eficazNumber && <span className="ml-2 text-xs text-slate-400">{row.eficazNumber}</span>}
                  {row.blocked && <span className="ml-2 text-xs text-red-600">bloqueado</span>}
                </td>
                <td className="px-4 py-2 text-slate-500">
                  {row.source === "CONVENIO" ? `Convênio ${row.convenioName ?? ""}` : "Normal"}
                </td>
                <td className="px-4 py-2 text-slate-900">{formatBRL(row.limitAmount)}</td>
                <td className="px-4 py-2 text-emerald-700">{formatBRL(row.availableAmount)}</td>
                <td className="px-4 py-2 text-slate-500">{formatBRL(row.usedAmount)}</td>
                <td className="px-4 py-2 text-slate-500">{formatBRL(row.openAmount)}</td>
                <td className="px-4 py-2 text-red-600">
                  {row.overdueAmount > 0 ? formatBRL(row.overdueAmount) : "—"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
                  Nenhum cliente nesse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Alteração em massa com confirmação obrigatória: o Admin só consegue
 * aplicar depois de ver quantos clientes serão afetados, o limite atual, o
 * novo e a exposição total antes e depois.
 */
function BulkLimitForm({
  convenios,
  selectedIds,
  onDone,
}: {
  convenios: { id: string; name: string }[];
  selectedIds: string[];
  onDone: () => void;
}) {
  const [convenioId, setConvenioId] = useState("");
  const [newLimit, setNewLimit] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<BulkLimitPreview | null>(null);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();

  // Seleção manual manda; sem ninguém marcado, vale o convênio inteiro.
  const payload = selectedIds.length > 0 ? { customerIds: selectedIds } : { convenioId: convenioId || undefined };
  const canSubmit = (selectedIds.length > 0 || convenioId) && newLimit !== "";

  function loadPreview() {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await previewBulkCreditoEficazLimitAction({ ...payload, newLimit: Number(newLimit) });
      if ("error" in result) {
        setPreview(null);
        setFeedback({ type: "error", message: result.error! });
        return;
      }
      setPreview(result.preview ?? null);
    });
  }

  function apply() {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await applyBulkCreditoEficazLimitAction({
        ...payload,
        newLimit: Number(newLimit),
        note,
      });
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setFeedback({ type: "success", message: result.success! });
      setPreview(null);
      onDone();
    });
  }

  return (
    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
      <h3 className="mb-1 text-sm font-semibold text-slate-900">Alterar limite em massa</h3>
      <p className="mb-3 text-xs text-slate-500">
        Marque clientes na lista abaixo ou escolha um convênio inteiro. Reduzir limite nunca apaga, reduz
        ou modifica dívida existente: quem já usou mais que o novo limite só fica impedido de comprar de
        novo até ter limite disponível.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="ce-bulk-convenio">Grupo</Label>
          <select
            id="ce-bulk-convenio"
            value={convenioId}
            onChange={(e) => {
              setConvenioId(e.target.value);
              setPreview(null);
            }}
            disabled={selectedIds.length > 0}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm disabled:bg-slate-100"
          >
            <option value="">
              {selectedIds.length > 0 ? `${selectedIds.length} selecionado(s)` : "Escolha um convênio"}
            </option>
            {convenios.map((convenio) => (
              <option key={convenio.id} value={convenio.id}>
                Convênio {convenio.name} (todos)
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="ce-bulk-limit">Novo limite (R$)</Label>
          <Input
            id="ce-bulk-limit"
            type="number"
            min={0}
            step="0.01"
            value={newLimit}
            onChange={(e) => {
              setNewLimit(e.target.value);
              setPreview(null);
            }}
          />
        </div>
        <div className="min-w-[14rem] flex-1">
          <Label htmlFor="ce-bulk-note">Motivo (vai para o histórico)</Label>
          <Input
            id="ce-bulk-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Alteração em massa realizada pelo administrador"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          fullWidth={false}
          disabled={isPending || !canSubmit}
          onClick={loadPreview}
          className="px-4"
        >
          Simular
        </Button>
      </div>

      {preview && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-semibold">Confirme antes de aplicar</p>
          <ul className="mt-1 space-y-0.5">
            <li>Clientes afetados: {preview.affected}</li>
            <li>
              Limite atual: {formatBRL(preview.currentTotalLimit)} (média{" "}
              {formatBRL(preview.currentAverageLimit)}) → novo limite: {formatBRL(preview.newLimit)} por
              cliente
            </li>
            <li>
              Exposição total (soma dos limites): {formatBRL(preview.currentTotalLimit)} →{" "}
              <strong>{formatBRL(preview.nextTotalLimit)}</strong>
            </li>
            <li>Já utilizado hoje: {formatBRL(preview.currentUsed)} — não muda com esta alteração</li>
            <li>Dívida em aberto: {formatBRL(preview.openAmount)} — não muda com esta alteração</li>
            {preview.belowUsedCount > 0 && (
              <li className="font-semibold">
                {preview.belowUsedCount} cliente(s) ficam com limite abaixo do que já usaram: o disponível
                vai a zero e novas compras ficam travadas até quitarem. A dívida continua igual.
              </li>
            )}
          </ul>
          <Button
            type="button"
            fullWidth={false}
            disabled={isPending || preview.affected === 0}
            onClick={apply}
            className="mt-3 px-4"
          >
            Confirmar alteração de {preview.affected} cliente(s)
          </Button>
        </div>
      )}

      {feedback && (
        <div className="mt-3">
          <FormBanner message={feedback.message} variant={feedback.type} />
        </div>
      )}
    </div>
  );
}
