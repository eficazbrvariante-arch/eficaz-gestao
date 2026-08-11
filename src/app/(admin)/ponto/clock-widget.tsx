"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormBanner } from "@/components/ui/form-banner";
import { SelfieCaptureField } from "@/components/ui/selfie-capture-field";
import { formatDateTime } from "@/lib/format";
import { getPunchStatusAction, punchAttendanceAction, type ActiveEmployeeOption } from "./actions";
import { ATTENDANCE_TYPE_LABELS } from "@/modules/attendance/attendance-rules";
import type { EffectiveAttendanceEntry } from "@/modules/attendance/attendance-service";
import type { AttendanceEntryType } from "@/generated/prisma/enums";

export function ClockWidget({
  employees,
  canWaive,
}: {
  employees: ActiveEmployeeOption[];
  canWaive: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState("");
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [nextType, setNextType] = useState<AttendanceEntryType | null>(null);
  const [todaysEntries, setTodaysEntries] = useState<EffectiveAttendanceEntry[]>([]);
  const [statusError, setStatusError] = useState<string>();

  const [capturing, setCapturing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  function submit(payload: { selfieUrl?: string; waived: boolean; waiveReason?: string }) {
    setError(undefined);
    startTransition(async () => {
      const result = await punchAttendanceAction({ userId: selectedId, ...payload });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCapturing(false);
      setSuccess(`${ATTENDANCE_TYPE_LABELS[result.type]} registrada com sucesso.`);
      router.refresh();
    });
  }

  function selectEmployee(id: string) {
    setSelectedId(id);
    setSuccess(undefined);
    setError(undefined);
    setCapturing(false);
    setStatusError(undefined);

    if (!id) {
      setNextType(null);
      setTodaysEntries([]);
      return;
    }

    setLoadingStatus(true);
    getPunchStatusAction(id).then((result) => {
      setLoadingStatus(false);
      if ("error" in result) {
        setStatusError(result.error);
        return;
      }
      setNextType(result.nextType);
      setTodaysEntries(result.todaysEntries);
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="ponto-colaborador" className="mb-2 block text-sm font-medium text-slate-700">
          Colaborador
        </label>
        <select
          id="ponto-colaborador"
          value={selectedId}
          onChange={(e) => selectEmployee(e.target.value)}
          disabled={isPending}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
        >
          <option value="">Selecione quem está batendo o ponto</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>
      </div>

      {!selectedId ? null : loadingStatus ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-400">Carregando...</p>
        </div>
      ) : statusError ? (
        <FormBanner message={statusError} variant="error" />
      ) : success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-emerald-700">✓ {success}</p>
        </div>
      ) : !nextType ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-emerald-700">
            O ciclo de ponto de hoje já foi encerrado.
          </p>
        </div>
      ) : !capturing ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="mb-4 text-sm text-slate-500">Próxima marcação</p>
          <p className="mb-6 text-lg font-semibold text-slate-900">
            {ATTENDANCE_TYPE_LABELS[nextType]}
          </p>
          <Button type="button" onClick={() => setCapturing(true)}>
            Registrar {ATTENDANCE_TYPE_LABELS[nextType].toLowerCase()}
          </Button>
          <FormBanner message={error} variant="error" />
        </div>
      ) : (
        <div className="space-y-3">
          <SelfieCaptureField
            canWaive={canWaive}
            disabled={isPending}
            onCaptured={(url) => submit({ selfieUrl: url, waived: false })}
            onWaive={(reason) => submit({ waived: true, waiveReason: reason })}
          />
          <button
            type="button"
            onClick={() => setCapturing(false)}
            className="block w-full text-center text-xs text-slate-500 hover:underline"
          >
            Cancelar
          </button>
          <FormBanner message={error} variant="error" />
        </div>
      )}

      {selectedId && !loadingStatus && !statusError && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Marcações de hoje</h2>
          {todaysEntries.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma marcação ainda.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {todaysEntries.map((entry) => (
                <li key={entry.id} className="flex justify-between text-slate-700">
                  <span>
                    {ATTENDANCE_TYPE_LABELS[entry.type]}
                    {entry.corrected && (
                      <span className="ml-1 text-xs text-amber-600">(corrigido)</span>
                    )}
                  </span>
                  <span className="text-slate-500">{formatDateTime(entry.occurredAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
