import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/session";
import { canManageSettings } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import {
  listAuditLogs,
  AUDIT_ACTION_LABELS,
  type AuditAction,
} from "@/modules/audit/audit-service";
import { EmptyState } from "@/components/admin/stat-card";

export default async function AtividadesPage() {
  const { user, tenant } = await requireTenant();
  if (!canManageSettings(user.role)) redirect("/dashboard");

  const logs = await listAuditLogs(tenant.id);

  return (
    <div>
      <div className="mb-6">
        <Link href="/usuarios" className="text-sm text-text-muted hover:underline">
          ← Voltar para usuários
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-foreground">Registro de atividades</h1>
        <p className="text-sm text-text-muted">
          Ações importantes feitas no painel: cancelamentos, ajustes de estoque, mudanças de
          usuário e de configuração.
        </p>
      </div>

      {logs.length === 0 ? (
        <EmptyState message="Nenhuma atividade registrada ainda." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Quando</th>
                <th className="px-4 py-3 font-medium">Quem</th>
                <th className="px-4 py-3 font-medium">Ação</th>
                <th className="px-4 py-3 font-medium">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-slate-100 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-slate-900">{log.userName}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {AUDIT_ACTION_LABELS[log.action as AuditAction] ?? log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{log.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Mostrando as últimas 200 atividades.
      </p>
    </div>
  );
}
