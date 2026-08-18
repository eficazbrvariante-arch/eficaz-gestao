"use client";

import { useState } from "react";
import { formatDateTime, formatISODate } from "@/lib/format";
import {
  ATTENDANCE_TYPE_LABELS,
  formatBalanceMinutes,
  formatWorkedMinutes,
  getNextExpectedAttendanceType,
  type BreakBalance,
} from "@/modules/attendance/attendance-rules";
import { AttendanceCorrectionForm } from "./attendance-correction-form";
import { AddMissingEntryForm } from "./add-missing-entry-form";
import type { AttendanceEntryType } from "@/generated/prisma/enums";

/** Verde quando ficou a mais (crédito), vermelho quando ficou a menos (débito) — nunca cinza neutro pra saldo diferente de zero. */
function BalanceBadge({ minutes }: { minutes: number }) {
  const colorClass =
    minutes > 0 ? "text-emerald-700" : minutes < 0 ? "text-red-600" : "text-slate-500";
  return <span className={`text-sm font-medium ${colorClass}`}>{formatBalanceMinutes(minutes)}</span>;
}

type DayGroup = {
  date: string;
  worked: { workedMinutes: number; open: boolean; incomplete: boolean };
  /** Saldo do dia (trabalhado - jornada esperada) — positivo é crédito, negativo é débito. */
  balanceMinutes: number;
  /** `null` quando o dia ainda não tem os dois marcos do intervalo. */
  breakBalance: BreakBalance | null;
  entries: {
    id: string;
    type: AttendanceEntryType;
    occurredAt: Date;
    corrected: boolean;
    selfieUrl: string | null;
    selfieWaived: boolean;
  }[];
};

export function EmployeeAttendanceList({
  userId,
  days,
  canCorrect,
}: {
  userId: string;
  days: DayGroup[];
  canCorrect: boolean;
}) {
  const [editingId, setEditingId] = useState<string>();
  const [addingDate, setAddingDate] = useState<string>();

  if (days.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
        Nenhuma marcação neste período.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {days.map((day) => {
        const suggestedType = getNextExpectedAttendanceType(day.entries);
        return (
        <div key={day.date} className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <span className="text-sm font-semibold text-slate-900">{formatISODate(day.date)}</span>
            {day.worked.incomplete ? (
              <span className="text-sm font-medium text-red-600">
                Falta bater saída — corrigir no Ponto
              </span>
            ) : (
              <span className="flex items-center gap-2 text-sm text-slate-600">
                {formatWorkedMinutes(day.worked.workedMinutes)}
                {day.worked.open && " (em andamento)"}
                <span className="text-slate-300">·</span>
                <BalanceBadge minutes={day.balanceMinutes} />
              </span>
            )}
          </div>
          <ul className="divide-y divide-slate-100">
            {day.entries.map((entry) => (
              <li key={entry.id} className="px-4 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-slate-700">
                    {ATTENDANCE_TYPE_LABELS[entry.type]}
                    {entry.corrected && (
                      <span className="ml-1 text-xs text-amber-600">(corrigido)</span>
                    )}
                    {entry.selfieWaived && (
                      <span className="ml-1 text-xs text-slate-400">(sem selfie)</span>
                    )}
                    {entry.type === "BREAK_END" && day.breakBalance && (
                      <span className="ml-2 text-xs text-slate-400">
                        intervalo de {formatWorkedMinutes(day.breakBalance.breakMinutes)}
                        {" · "}
                        <BalanceBadge minutes={day.breakBalance.deltaMinutes} />
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500">{formatDateTime(entry.occurredAt)}</span>
                    {entry.selfieUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- URL do Vercel Blob, domínio dinâmico por tenant
                      <img
                        src={entry.selfieUrl}
                        alt="Selfie da marcação"
                        className="h-10 w-10 rounded-full border border-slate-200 object-cover"
                      />
                    )}
                    {canCorrect && editingId !== entry.id && (
                      <button
                        type="button"
                        onClick={() => setEditingId(entry.id)}
                        className="text-xs font-medium text-slate-700 hover:underline"
                      >
                        Corrigir
                      </button>
                    )}
                  </div>
                </div>
                {editingId === entry.id && (
                  <div className="mt-2">
                    <AttendanceCorrectionForm
                      entryId={entry.id}
                      currentType={entry.type}
                      currentOccurredAt={entry.occurredAt}
                      onDone={() => setEditingId(undefined)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
          {canCorrect && suggestedType && (
            <div className="border-t border-slate-100 px-4 py-2">
              {addingDate === day.date ? (
                <AddMissingEntryForm
                  userId={userId}
                  date={day.date}
                  suggestedType={suggestedType}
                  onDone={() => setAddingDate(undefined)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingDate(day.date)}
                  className="text-xs font-medium text-amber-700 hover:underline"
                >
                  + Adicionar marcação faltando ({ATTENDANCE_TYPE_LABELS[suggestedType]})
                </button>
              )}
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}
