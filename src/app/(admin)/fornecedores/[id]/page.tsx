import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SupplierForm } from "../supplier-form";

export default async function EditarFornecedorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const supplier = await prisma.supplier.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!supplier) notFound();

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-foreground">Editar fornecedor</h1>
      <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <SupplierForm
          supplierId={supplier.id}
          defaultValues={{
            name: supplier.name,
            document: supplier.document ?? "",
            phone: supplier.phone ?? "",
            email: supplier.email ?? "",
            addressStreet: supplier.addressStreet ?? "",
            addressCity: supplier.addressCity ?? "",
          }}
        />
      </div>
    </div>
  );
}
