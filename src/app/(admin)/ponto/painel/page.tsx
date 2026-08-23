import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { canViewAttendancePanel } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import {
  formatWorkedMinutes,
  TODAY_STATUS_LABELS,
  type TodayAttendanceStatus,
} from "@/modules/attendance/attendance-rules";
import { getTodayAttendanceOverview } from "@/modules/attendance/attendance-service";
import { StatCard, EmptyState } from "@/components/admin/stat-card";
import { clsx } from "@/lib/clsx";

const STATUS_TONE: Record<TodayAttendanceStatus, string> = {
  NOT_STARTED: "text-slate-400",
  WORKING: "text-emerald-700",
  ON_BREAK: "text-amber-600",
  FINISHED: "text-slate-600",
};

export default async function PontoPainelPage() {
  const user = await requireUser();
  if (!canViewAttendancePanel(user.role)) redirect("/ponto");

  const overview = await getTodayAttendanceOverview(user.tenantId);

  const counts = {
    WORKING: overview.filter((o) => o.status === "WORKING").length,
    ON_BREAK: overview.filter((o) => o.status === "ON_BREAK").length,
    FINISHED: overview.filter((o) => o.status === "FINISHED").length,
    NOT_STARTED: overview.filter((o) => o.status === "NOT_STARTED").length,
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Painel de Ponto — Hoje</h1>
          <p className="text-sm text-text-muted">Presença dos colaboradores ativos, em tempo real.</p>
        </div>
        <Link
          href="/ponto/historico"
          className="text-sm font-medium text-slate-700 hover:underline"
        >
          Meu ponto
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Presentes" value={String(counts.WORKING)} tone="positive" />
        <StatCard label="Em intervalo" value={String(counts.ON_BREAK)} />
        <StatCard label="Encerraram" value={String(counts.FINISHED)} />
        <StatCard label="Ainda não entraram" value={String(counts.NOT_STARTED)} />
      </div>

      {overview.length === 0 ? (
        <EmptyState message="Nenhum colaborador ativo cadastrado." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Colaborador</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Última marcação</th>
                <th className="px-4 py-2 font-medium">Horas hoje</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {overview.map((row) => (
                <tr key={row.userId} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-medium text-slate-900">{row.userName}</td>
                  <td className={clsx("px-4 py-2", STATUS_TONE[row.status])}>
                    {TODAY_STATUS_LABELS[row.status]}
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {row.lastEntryAt ? formatDateTime(row.lastEntryAt) : "-"}
                  </td>
                  <td className="px-4 py-2 text-slate-700">
                    {formatWorkedMinutes(row.workedMinutes)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/ponto/colaborador/${row.userId}`}
                      className="text-xs font-medium text-slate-700 hover:underline"
                    >
                      Ver histórico
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
