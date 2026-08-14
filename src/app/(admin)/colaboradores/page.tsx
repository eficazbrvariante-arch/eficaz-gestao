import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canEditCommission, canManageEmployeeLedger } from "@/lib/permissions";
import { formatBRL } from "@/lib/format";
import { StatCard } from "@/components/admin/stat-card";
import { getEmployeeLedgerSummary } from "@/modules/employees/employee-ledger-service";
import { getCommissionTotalsByUsers } from "@/modules/employees/commission-service";
import {
  EmployeeLedgerPanel,
  type EmployeeCardRow,
  type EmployeeLedgerEntryRow,
} from "./employee-ledger-panel";

export default async function ColaboradoresPage() {
  const user = await requireUser();
  if (!canManageEmployeeLedger(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar o painel de colaboradores.
      </div>
    );
  }

  const [sellers, tenant, debtSummary, entries, totalActiveProducts, commissionedProducts] =
    await Promise.all([
      prisma.user.findMany({
        where: { tenantId: user.tenantId, active: true, role: { in: ["SELLER", "MANAGER"] } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.tenant.findUniqueOrThrow({
        where: { id: user.tenantId },
        select: { defaultCommissionPercent: true },
      }),
      getEmployeeLedgerSummary(user.tenantId),
      prisma.employeeLedgerEntry.findMany({
        where: { tenantId: user.tenantId },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.product.count({ where: { tenantId: user.tenantId, active: true } }),
      prisma.product.count({
        where: { tenantId: user.tenantId, active: true, commissionEnabled: true },
      }),
    ]);

  const commissionTotals = await getCommissionTotalsByUsers(
    user.tenantId,
    sellers.map((s) => s.id)
  );
  const debtByUser = new Map(debtSummary.map((row) => [row.userId, row]));

  const cardRows: EmployeeCardRow[] = sellers.map((seller) => {
    const debt = debtByUser.get(seller.id);
    return {
      userId: seller.id,
      userName: seller.name,
      advancePending: debt?.advancePending ?? 0,
      purchasePending: debt?.purchasePending ?? 0,
      totalPending: debt?.totalPending ?? 0,
      commissionTotal: commissionTotals.get(seller.id) ?? 0,
    };
  });

  const entryRows: EmployeeLedgerEntryRow[] = entries.map((entry) => ({
    id: entry.id,
    userName: entry.user.name,
    type: entry.type,
    amount: Number(entry.amount),
    description: entry.description,
    status: entry.status,
    createdAt: entry.createdAt,
  }));

  const totalPending = debtSummary.reduce((sum, row) => sum + row.totalPending, 0);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Colaboradores</h1>
      <p className="mb-6 text-sm text-slate-500">
        Adiantamento de salário, compra de mercadoria e comissão de venda.
      </p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Total pendente" value={formatBRL(totalPending)} tone="negative" />
        <StatCard
          label="Colaboradores com pendência"
          value={String(debtSummary.length)}
        />
      </div>

      <EmployeeLedgerPanel
        cardRows={cardRows}
        entries={entryRows}
        defaultCommissionPercent={Number(tenant.defaultCommissionPercent)}
        canEditCommission={canEditCommission(user.role)}
        totalActiveProducts={totalActiveProducts}
        commissionedProducts={commissionedProducts}
      />
    </div>
  );
}
