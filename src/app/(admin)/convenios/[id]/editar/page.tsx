import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { parseConvenioRules } from "@/lib/validations/convenio";
import { ConvenioForm } from "../../convenio-form";

export default async function EditarConvenioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const convenio = await prisma.convenio.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!convenio) notFound();

  const rules = parseConvenioRules(convenio.rules);

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-foreground">Editar convênio</h1>
      <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <ConvenioForm
          convenioId={convenio.id}
          defaultValues={{
            name: convenio.name,
            slug: convenio.slug,
            logoUrl: convenio.logoUrl ?? "",
            responsibleName: convenio.responsibleName ?? "",
            responsiblePhone: convenio.responsiblePhone ?? "",
            active: convenio.active,
            ...rules,
          }}
        />
      </div>
    </div>
  );
}
