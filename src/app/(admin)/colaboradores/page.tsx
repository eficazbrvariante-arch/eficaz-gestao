import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageEmployeeLedger } from "@/lib/permissions";
import { formatBRL } from "@/lib/format";
import { StatCard } from "@/components/admin/stat-card";
import { getEmployeeLedgerSummary } from "@/modules/employees/employee-ledger-service";
import { EmployeeLedgerPanel, type EmployeeLedgerEntryRow } from "./employee-ledger-panel";

export default async function ColaboradoresPage() {
  const user = await requireUser();
  if (!canManageEmployeeLedger(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar o painel de colaboradores.
      </div>
    );
  }

  const [summary, entries] = await Promise.all([
    getEmployeeLedgerSummary(user.tenantId),
    prisma.employeeLedgerEntry.findMany({
      where: { tenantId: user.tenantId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const entryRows: EmployeeLedgerEntryRow[] = entries.map((entry) => ({
    id: entry.id,
    userName: entry.user.name,
    type: entry.type,
    amount: Number(entry.amount),
    description: entry.description,
    status: entry.status,
    createdAt: entry.createdAt,
  }));

  const totalPending = summary.reduce((sum, row) => sum + row.totalPending, 0);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Colaboradores</h1>
      <p className="mb-6 text-sm text-slate-500">
        Adiantamento de salário e compra de mercadoria a descontar em folha.
      </p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Total pendente" value={formatBRL(totalPending)} tone="negative" />
        <StatCard
          label="Colaboradores com pendência"
          value={String(summary.length)}
        />
      </div>

      <EmployeeLedgerPanel summary={summary} entries={entryRows} />
    </div>
  );
}
