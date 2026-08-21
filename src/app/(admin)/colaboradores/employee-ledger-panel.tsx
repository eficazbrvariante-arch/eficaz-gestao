"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatBRL, formatDateTime } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormBanner } from "@/components/ui/form-banner";
import { EmptyState } from "@/components/admin/stat-card";
import {
  EMPLOYEE_LEDGER_TYPE_LABELS,
  type EmployeeLedgerTypeValue,
} from "@/lib/validations/employee-ledger";
import {
  createEmployeeLedgerEntryAction,
  deleteEmployeeLedgerEntryAction,
  listEmployeesAction,
  setAllProductsCommissionEnabledAction,
  setDefaultCommissionPercentAction,
  settleEmployeeLedgerEntryAction,
  type EmployeeOption,
} from "./actions";

export type EmployeeCardRow = {
  userId: string;
  userName: string;
  advancePending: number;
  purchasePending: number;
  hourlyPending: number;
  otherPending: number;
  totalPending: number;
  /** Acumulado de todas as vendas concluídas — não é "pendente", é o total já ganho. */
  commissionTotal: number;
};

export type EmployeeLedgerEntryRow = {
  id: string;
  userName: string;
  type: EmployeeLedgerTypeValue;
  amount: number;
  description: string | null;
  status: "PENDING" | "PAID";
  createdAt: Date;
  /** Selfie do colaborador confirmando o recebimento — null quando foi o Admin/Gerente quem marcou como pago. */
  paidSelfieUrl: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  PAID: "bg-emerald-50 text-emerald-700",
};
const STATUS_LABEL: Record<string, string> = { PENDING: "Pendente", PAID: "Pago" };

export function EmployeeLedgerPanel({
  cardRows,
  entries,
  defaultCommissionPercent,
  canEditCommission,
  totalActiveProducts,
  commissionedProducts,
}: {
  cardRows: EmployeeCardRow[];
  entries: EmployeeLedgerEntryRow[];
  defaultCommissionPercent: number;
  /** Gerente só visualiza a comissão (geral e por produto) — só ADMIN altera. */
  canEditCommission: boolean;
  /** Total de produtos ativos do tenant — pra mostrar quantos entram na comissão geral. */
  totalActiveProducts: number;
  /** Quantos desses produtos ativos estão marcados com `commissionEnabled`. */
  commissionedProducts: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [confirmAllCommission, setConfirmAllCommission] = useState<"enable" | "disable" | null>(
    null
  );
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<EmployeeLedgerEntryRow | null>(null);
  // Contagem local (ajustada de forma otimista a cada marcar/desmarcar) —
  // resincroniza com o valor vindo do servidor quando ele muda, sem passar
  // por um efeito: setState durante a renderização evita um re-render extra
  // em cascata (mesmo padrão usado em `produtos-tabela.tsx`).
  const [syncedCommissionedProducts, setSyncedCommissionedProducts] = useState(commissionedProducts);
  const [commissionedCount, setCommissionedCount] = useState(commissionedProducts);
  if (commissionedProducts !== syncedCommissionedProducts) {
    setSyncedCommissionedProducts(commissionedProducts);
    setCommissionedCount(commissionedProducts);
  }

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  useEffect(() => {
    listEmployeesAction().then(setEmployees);
  }, []);

  const [userId, setUserId] = useState("");
  const [type, setType] = useState<EmployeeLedgerTypeValue>("ADVANCE");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const [commissionPercent, setCommissionPercent] = useState(String(defaultCommissionPercent));

  function handleCreate() {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await createEmployeeLedgerEntryAction({
        userId,
        type,
        amount: Number(amount),
        description,
      });
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setUserId("");
      setType("ADVANCE");
      setAmount("");
      setDescription("");
      setFeedback({ type: "success", message: "Lançamento registrado." });
    });
  }

  function handleSettle(id: string) {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await settleEmployeeLedgerEntryAction(id);
      if (result?.error) setFeedback({ type: "error", message: result.error });
    });
  }

  function handleDelete() {
    if (!confirmDeleteEntry) return;
    setFeedback(undefined);
    startTransition(async () => {
      const result = await deleteEmployeeLedgerEntryAction(confirmDeleteEntry.id);
      setConfirmDeleteEntry(null);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setFeedback({ type: "success", message: "Lançamento excluído." });
      router.refresh();
    });
  }

  function handleSaveCommission() {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await setDefaultCommissionPercentAction(Number(commissionPercent));
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setFeedback({ type: "success", message: "Comissão geral atualizada." });
    });
  }

  function handleSetAllProductsCommission() {
    if (!confirmAllCommission) return;
    const enabled = confirmAllCommission === "enable";
    setFeedback(undefined);
    startTransition(async () => {
      const result = await setAllProductsCommissionEnabledAction(enabled);
      setConfirmAllCommission(null);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setFeedback({ type: "success", message: result?.success ?? "Produtos atualizados." });
      setCommissionedCount(enabled ? totalActiveProducts : 0);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-1 text-sm font-semibold text-slate-900">Produtos comissionados</p>
        <p className="mb-3 text-xs text-slate-500">
          Só produto marcado entra na comissão geral de venda (abaixo). Quer um percentual
          diferente só num produto? Isso é exceção, ajustada na{" "}
          <Link href="/produtos" className="font-medium text-slate-700 hover:underline">
            edição de cada produto
          </Link>
          .{!canEditCommission && " Somente o Administrador pode alterar."}
        </p>
        <p className="mb-3 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">{commissionedCount}</span> de{" "}
          {totalActiveProducts} produto(s) ativo(s) comissionado(s).
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/colaboradores/produtos-comissionados"
            className="inline-flex w-auto items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            Selecionar produtos comissionados
          </Link>
          {canEditCommission && (
            <>
              <Button
                type="button"
                variant="secondary"
                fullWidth={false}
                disabled={isPending || totalActiveProducts === 0}
                onClick={() => setConfirmAllCommission("enable")}
                className="px-4"
              >
                Comissionar todos os produtos
              </Button>
              <Button
                type="button"
                variant="secondary"
                fullWidth={false}
                disabled={isPending || commissionedCount === 0}
                onClick={() => setConfirmAllCommission("disable")}
                className="px-4"
              >
                Remover comissão de todos
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-1 text-sm font-semibold text-slate-900">Comissão geral de venda</p>
        <p className="mb-3 text-xs text-slate-500">
          Percentual sobre o valor líquido vendido, usado nos produtos comissionados que não têm
          um percentual individual próprio.
          {!canEditCommission && " Somente o Administrador pode alterar."}
        </p>
        <div className="flex items-end gap-3">
          <div className="w-32">
            <Label htmlFor="commission-percent">Comissão (%)</Label>
            <Input
              id="commission-percent"
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(e.target.value)}
              disabled={!canEditCommission}
            />
          </div>
          {canEditCommission && (
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={handleSaveCommission}
              fullWidth={false}
              className="px-4"
            >
              Salvar
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-slate-900">Registrar lançamento</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="employee">Colaborador</Label>
            <Select id="employee" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Selecione</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="type">Tipo</Label>
            <Select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as EmployeeLedgerTypeValue)}
            >
              {Object.entries(EMPLOYEE_LEDGER_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="amount">Valor (R$)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="description">
              Descrição{type === "OTHER" ? "" : " (opcional)"}
            </Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={type === "OTHER" ? "Ex.: vale-transporte, comissão relâmpago" : "Ex.: cabo USB-C"}
            />
          </div>
        </div>
        <Button
          type="button"
          disabled={isPending || !userId || !amount || (type === "OTHER" && !description.trim())}
          onClick={handleCreate}
          fullWidth={false}
          className="mt-4 px-4"
        >
          Registrar
        </Button>
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-slate-900">Colaboradores</p>
        {cardRows.length === 0 ? (
          <EmptyState message="Nenhum Vendedor ou Gerente ativo cadastrado." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cardRows.map((row) => (
              <div key={row.userId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-bold text-black">{row.userName}</p>
                <div className="mt-2 space-y-1 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <span>Adiantamento</span>
                    <span>{formatBRL(row.advancePending)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Mercadoria</span>
                    <span>{formatBRL(row.purchasePending)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pagamento por hora</span>
                    <span>{formatBRL(row.hourlyPending)}</span>
                  </div>
                  {row.otherPending > 0 && (
                    <div className="flex justify-between">
                      <span>Outro</span>
                      <span>{formatBRL(row.otherPending)}</span>
                    </div>
                  )}
                </div>
                <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-sm font-bold text-black">
                  <span>Total pendente</span>
                  <span>{formatBRL(row.totalPending)}</span>
                </div>
                <Link
                  href={`/colaboradores/${row.userId}/comissao`}
                  className="mt-3 flex justify-between border-t border-slate-100 pt-2 text-sm font-medium text-emerald-700 hover:underline"
                >
                  <span>Comissão de venda</span>
                  <span>{formatBRL(row.commissionTotal)}</span>
                </Link>
                <Link
                  href={`/colaboradores/${row.userId}/horas`}
                  className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-sm font-medium text-slate-700 hover:underline"
                >
                  <span>Pagamento por horas</span>
                  <span>Calcular →</span>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-slate-900">Lançamentos</p>
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Colaborador</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Descrição</th>
                <th className="px-3 py-2 font-medium text-right">Valor</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 text-slate-500">{formatDateTime(entry.createdAt)}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{entry.userName}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {EMPLOYEE_LEDGER_TYPE_LABELS[entry.type]}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{entry.description ?? "-"}</td>
                  <td className="px-3 py-2 text-right font-medium text-slate-900">
                    {formatBRL(entry.amount)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[entry.status]}`}>
                      {STATUS_LABEL[entry.status]}
                    </span>
                    {entry.paidSelfieUrl && (
                      <a
                        href={entry.paidSelfieUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-xs font-medium text-slate-500 hover:underline"
                      >
                        ver selfie
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {entry.status === "PENDING" && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleSettle(entry.id)}
                        className="text-xs font-medium text-slate-700 hover:underline disabled:opacity-50"
                      >
                        Marcar como pago
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setConfirmDeleteEntry(entry)}
                      className="ml-3 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                    Nenhum lançamento ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog
        open={confirmAllCommission !== null}
        onClose={() => setConfirmAllCommission(null)}
        title={
          confirmAllCommission === "enable"
            ? "Comissionar todos os produtos"
            : "Remover comissão de todos os produtos"
        }
        description={
          confirmAllCommission === "enable"
            ? `Marca os ${totalActiveProducts} produto(s) ativo(s) pra entrar na comissão geral de venda. Você pode abrir exceção (percentual menor ou sem comissão) depois, produto por produto.`
            : `Remove a comissão dos ${commissionedCount} produto(s) atualmente comissionado(s). O percentual individual de cada um é mantido, só fica sem efeito até marcar de novo.`
        }
        footer={
          <>
            <Button variant="secondary" fullWidth={false} onClick={() => setConfirmAllCommission(null)}>
              Cancelar
            </Button>
            <Button
              variant="brand"
              fullWidth={false}
              disabled={isPending}
              onClick={handleSetAllProductsCommission}
            >
              Confirmar
            </Button>
          </>
        }
      />

      <Dialog
        open={confirmDeleteEntry !== null}
        onClose={() => setConfirmDeleteEntry(null)}
        title="Excluir lançamento"
        description={
          confirmDeleteEntry
            ? `Remove o lançamento de ${EMPLOYEE_LEDGER_TYPE_LABELS[confirmDeleteEntry.type]} de ${confirmDeleteEntry.userName} — ${formatBRL(confirmDeleteEntry.amount)}. Não dá pra desfazer.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" fullWidth={false} onClick={() => setConfirmDeleteEntry(null)}>
              Cancelar
            </Button>
            <Button variant="danger" fullWidth={false} disabled={isPending} onClick={handleDelete}>
              Excluir
            </Button>
          </>
        }
      />
    </div>
  );
}
