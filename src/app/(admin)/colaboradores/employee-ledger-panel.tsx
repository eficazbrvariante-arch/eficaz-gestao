"use client";

import { useEffect, useState, useTransition } from "react";
import { formatBRL, formatDateTime } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FormBanner } from "@/components/ui/form-banner";
import { EmptyState } from "@/components/admin/stat-card";
import {
  EMPLOYEE_LEDGER_TYPE_LABELS,
  type EmployeeLedgerTypeValue,
} from "@/lib/validations/employee-ledger";
import {
  createEmployeeLedgerEntryAction,
  listEmployeesAction,
  settleEmployeeLedgerEntryAction,
  type EmployeeOption,
} from "./actions";
import type { EmployeeLedgerSummaryRow } from "@/modules/employees/employee-ledger-service";

export type EmployeeLedgerEntryRow = {
  id: string;
  userName: string;
  type: EmployeeLedgerTypeValue;
  amount: number;
  description: string | null;
  status: "PENDING" | "PAID";
  createdAt: Date;
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  PAID: "bg-emerald-50 text-emerald-700",
};
const STATUS_LABEL: Record<string, string> = { PENDING: "Pendente", PAID: "Pago" };

export function EmployeeLedgerPanel({
  summary,
  entries,
}: {
  summary: EmployeeLedgerSummaryRow[];
  entries: EmployeeLedgerEntryRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  useEffect(() => {
    listEmployeesAction().then(setEmployees);
  }, []);

  const [userId, setUserId] = useState("");
  const [type, setType] = useState<EmployeeLedgerTypeValue>("ADVANCE");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

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

  return (
    <div className="space-y-6">
      <FormBanner message={feedback?.message} variant={feedback?.type} />

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
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: cabo USB-C"
            />
          </div>
        </div>
        <Button
          type="button"
          disabled={isPending || !userId || !amount}
          onClick={handleCreate}
          fullWidth={false}
          className="mt-4 px-4"
        >
          Registrar
        </Button>
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-slate-900">Saldo pendente por colaborador</p>
        {summary.length === 0 ? (
          <EmptyState message="Ninguém com pendência no momento." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {summary.map((row) => (
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
                </div>
                <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-sm font-bold text-black">
                  <span>Total</span>
                  <span>{formatBRL(row.totalPending)}</span>
                </div>
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
                  </td>
                  <td className="px-3 py-2 text-right">
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
    </div>
  );
}
