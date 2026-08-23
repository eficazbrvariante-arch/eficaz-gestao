import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { MembroForm } from "../membro-form";

export default async function NovoMembroPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const convenio = await prisma.convenio.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, name: true },
  });
  if (!convenio) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link href={`/convenios/${convenio.id}`} className="text-sm text-text-muted hover:underline">
          ← Voltar para {convenio.name}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-foreground">Novo colaborador — {convenio.name}</h1>
      </div>
      <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <MembroForm convenioId={convenio.id} />
      </div>
    </div>
  );
}
