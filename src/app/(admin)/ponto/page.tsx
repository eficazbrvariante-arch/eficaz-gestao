import { requireUser } from "@/lib/session";
import { canWaiveAttendanceSelfie } from "@/lib/permissions";
import { todayRange, formatDateTime } from "@/lib/format";
import { getNextExpectedForToday, listEffectiveEntries } from "@/modules/attendance/attendance-service";
import { ATTENDANCE_TYPE_LABELS } from "@/modules/attendance/attendance-rules";
import { ClockWidget } from "./clock-widget";

export default async function PontoPage() {
  const user = await requireUser();
  const { start, end } = todayRange();

  const [nextType, todaysEntries] = await Promise.all([
    getNextExpectedForToday(user.tenantId, user.id),
    listEffectiveEntries(user.tenantId, { userId: user.id, from: start, to: end }),
  ]);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Controle de Ponto</h1>
      <p className="mb-6 text-sm text-slate-500">{user.name}</p>

      <ClockWidget nextType={nextType} canWaive={canWaiveAttendanceSelfie(user.role)} />

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Marcações de hoje</h2>
        {todaysEntries.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma marcação ainda.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {todaysEntries.map((entry) => (
              <li key={entry.id} className="flex justify-between text-slate-700">
                <span>
                  {ATTENDANCE_TYPE_LABELS[entry.type]}
                  {entry.corrected && <span className="ml-1 text-xs text-amber-600">(corrigido)</span>}
                </span>
                <span className="text-slate-500">{formatDateTime(entry.occurredAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
