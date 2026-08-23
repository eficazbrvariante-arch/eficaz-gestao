import { requireUser } from "@/lib/session";
import { formatDateTime, formatISODate, periodRange, todayISO } from "@/lib/format";
import {
  listEffectiveEntries,
  type EffectiveAttendanceEntry,
} from "@/modules/attendance/attendance-service";
import {
  ATTENDANCE_TYPE_LABELS,
  computeWorkedMinutesForDay,
  formatWorkedMinutes,
} from "@/modules/attendance/attendance-rules";
import { resolvePeriod } from "../../relatorios/period";
import { PeriodPicker } from "../../relatorios/report-nav";

export default async function PontoHistoricoPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const user = await requireUser();
  const period = resolvePeriod(await searchParams);
  const { start, end } = periodRange(period.from, period.to);

  const entries = await listEffectiveEntries(user.tenantId, { userId: user.id, from: start, to: end });

  const dayGroups = new Map<string, EffectiveAttendanceEntry[]>();
  for (const entry of entries) {
    const key = todayISO(entry.occurredAt);
    const list = dayGroups.get(key) ?? [];
    list.push(entry);
    dayGroups.set(key, list);
  }

  const todayKey = todayISO();
  const days = [...dayGroups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, dayEntries]) => {
      const sorted = [...dayEntries].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
      return { date, entries: sorted, worked: computeWorkedMinutesForDay(sorted, date === todayKey) };
    });

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-foreground">Meu histórico de ponto</h1>
      <p className="mb-6 text-sm text-text-muted">
        {formatISODate(period.from)} a {formatISODate(period.to)}
      </p>

      <PeriodPicker period={period} />

      {days.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
          Nenhuma marcação neste período.
        </div>
      ) : (
        <div className="space-y-4">
          {days.map((day) => (
            <div key={day.date} className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <span className="text-sm font-semibold text-slate-900">
                  {formatISODate(day.date)}
                </span>
                <span className="text-sm text-slate-600">
                  {day.worked.incomplete ? (
                    <span className="text-red-600">Falta bater saída — corrigir no Ponto</span>
                  ) : (
                    <>
                      {formatWorkedMinutes(day.worked.workedMinutes)}
                      {day.worked.open && " (em andamento)"}
                    </>
                  )}
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {day.entries.map((entry) => (
                  <li key={entry.id} className="flex justify-between px-4 py-2 text-sm">
                    <span className="text-slate-700">
                      {ATTENDANCE_TYPE_LABELS[entry.type]}
                      {entry.corrected && (
                        <span className="ml-1 text-xs text-amber-600">(corrigido)</span>
                      )}
                      {entry.selfieWaived && (
                        <span className="ml-1 text-xs text-slate-400">(sem selfie)</span>
                      )}
                    </span>
                    <span className="text-slate-500">{formatDateTime(entry.occurredAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
