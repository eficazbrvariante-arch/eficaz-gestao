import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageConvenios } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { parseConvenioRules } from "@/lib/validations/convenio";
import { formatBRL } from "@/lib/format";

export default async function ConveniosPage() {
  const user = await requireUser();
  if (!canManageConvenios(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar Convênios Corporativos.
      </div>
    );
  }

  const convenios = await prisma.convenio.findMany({
    where: { tenantId: user.tenantId },
    include: {
      _count: { select: { members: true } },
    },
    orderBy: { name: "asc" },
  });

  const activeCounts = await prisma.convenioMember.groupBy({
    by: ["convenioId"],
    where: { tenantId: user.tenantId, status: "ACTIVE" },
    _count: { _all: true },
  });
  const activeByConvenio = new Map(activeCounts.map((row) => [row.convenioId, row._count._all]));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Convênios Corporativos</h1>
          <p className="text-sm text-slate-500">
            Empresas parceiras, colaboradores vinculados e o benefício de cada uma.
          </p>
        </div>
        <Link
          href="/convenios/novo"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Novo convênio
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Empresa</th>
              <th className="px-4 py-3 font-medium">Benefício</th>
              <th className="px-4 py-3 font-medium">Colaboradores</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {convenios.map((convenio) => {
              const rules = parseConvenioRules(convenio.rules);
              const activeCount = activeByConvenio.get(convenio.id) ?? 0;
              return (
                <tr key={convenio.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{convenio.name}</div>
                    <div className="text-xs text-slate-400">{convenio.responsibleName || "-"}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatBRL(rules.benefitAmount)} · {rules.usesPerPeriod}x a cada {rules.periodDays}d
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {activeCount} ativo(s) de {convenio._count.members}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={convenio.active ? "success" : "neutral"}>
                      {convenio.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/convenios/${convenio.id}`} className="text-sm text-slate-600 hover:underline">
                      Ver
                    </Link>
                  </td>
                </tr>
              );
            })}
            {convenios.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Nenhum convênio cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
