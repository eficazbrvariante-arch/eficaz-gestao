import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageConvenios } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/format";
import { parseConvenioRules } from "@/lib/validations/convenio";
import { MembrosTabela, type ConvenioMemberRow } from "./membros-tabela";
import { InviteLinkPanel, type ActiveInvite } from "./invite-link-panel";

export default async function ConvenioDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  if (!canManageConvenios(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar Convênios Corporativos.
      </div>
    );
  }

  const [convenio, activeInviteRow] = await Promise.all([
    prisma.convenio.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        members: { orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.convenioInvite.findFirst({
      where: { convenioId: id, tenantId: user.tenantId, revokedAt: null },
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!convenio) notFound();

  const activeInvite: ActiveInvite | null = activeInviteRow
    ? {
        id: activeInviteRow.id,
        createdAt: activeInviteRow.createdAt,
        createdByName: activeInviteRow.createdBy.name,
      }
    : null;

  const rules = parseConvenioRules(convenio.rules);
  const memberRows: ConvenioMemberRow[] = convenio.members.map((member) => ({
    id: member.id,
    name: member.name,
    document: member.document,
    phone: member.phone,
    email: member.email,
    status: member.status,
    statusReason: member.statusReason,
    selfieUrl: member.selfieUrl,
    proofUrl: member.proofUrl,
    createdAt: member.createdAt,
  }));

  return (
    <div>
      <div className="mb-6">
        <Link href="/convenios" className="text-sm text-slate-500 hover:underline">
          ← Voltar para Convênios
        </Link>
        <div className="mt-2 flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold text-slate-900">{convenio.name}</h1>
          <Link
            href={`/convenios/${convenio.id}/editar`}
            className="text-sm text-slate-600 hover:underline"
          >
            Editar convênio
          </Link>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={convenio.active ? "success" : "neutral"}>
            {convenio.active ? "Ativo" : "Inativo"}
          </Badge>
          <span className="text-sm text-slate-600">
            Benefício: <strong>{formatBRL(rules.benefitAmount)}</strong>
          </span>
          <span className="text-sm text-slate-600">
            Limite: <strong>{rules.usesPerPeriod}x</strong> a cada{" "}
            <strong>{rules.periodDays} dia(s)</strong>
          </span>
          <span className="text-sm text-slate-600">
            Comprovante: <strong>{rules.requireProof ? "obrigatório" : "opcional"}</strong>
          </span>
        </div>
        {convenio.responsibleName && (
          <p className="mt-2 text-sm text-slate-500">
            Responsável: {convenio.responsibleName}
            {convenio.responsiblePhone && ` · ${convenio.responsiblePhone}`}
          </p>
        )}
      </div>

      <div className="mb-6">
        <InviteLinkPanel convenioId={convenio.id} activeInvite={activeInvite} />
      </div>

      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900">Colaboradores</h2>
        <Link
          href={`/convenios/${convenio.id}/membros/novo`}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Novo colaborador
        </Link>
      </div>

      <MembrosTabela members={memberRows} />
    </div>
  );
}
