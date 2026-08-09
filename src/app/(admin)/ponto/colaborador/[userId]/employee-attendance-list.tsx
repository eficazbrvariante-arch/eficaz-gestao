"use client";

import { useState } from "react";
import { formatDateTime, formatISODate } from "@/lib/format";
import { ATTENDANCE_TYPE_LABELS, formatWorkedMinutes } from "@/modules/attendance/attendance-rules";
import { AttendanceCorrectionForm } from "./attendance-correction-form";
import type { AttendanceEntryType } from "@/generated/prisma/enums";

type DayGroup = {
  date: string;
  worked: { workedMinutes: number; open: boolean };
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
  days,
  canCorrect,
}: {
  days: DayGroup[];
  canCorrect: boolean;
}) {
  const [editingId, setEditingId] = useState<string>();

  if (days.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
        Nenhuma marcação neste período.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {days.map((day) => (
        <div key={day.date} className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <span className="text-sm font-semibold text-slate-900">{formatISODate(day.date)}</span>
            <span className="text-sm text-slate-600">
              {formatWorkedMinutes(day.worked.workedMinutes)}
              {day.worked.open && " (em andamento)"}
            </span>
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
        </div>
      ))}
    </div>
  );
}
