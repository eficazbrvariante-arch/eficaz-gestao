"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { supplierSchema, type SupplierInput } from "@/lib/validations/catalog";

function normalizeSupplierData(data: SupplierInput) {
  return {
    name: data.name,
    document: data.document || null,
    phone: data.phone || null,
    email: data.email || null,
    addressStreet: data.addressStreet || null,
    addressCity: data.addressCity || null,
  };
}

export async function createSupplierAction(input: SupplierInput) {
  const user = await requireUser();
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  await prisma.supplier.create({
    data: { tenantId: user.tenantId, ...normalizeSupplierData(parsed.data) },
  });

  revalidatePath("/fornecedores");
  redirect("/fornecedores");
}

export async function updateSupplierAction(id: string, input: SupplierInput) {
  const user = await requireUser();
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  const result = await prisma.supplier.updateMany({
    where: { id, tenantId: user.tenantId },
    data: normalizeSupplierData(parsed.data),
  });
  if (result.count === 0) return { error: "Fornecedor não encontrado." };

  revalidatePath("/fornecedores");
  redirect("/fornecedores");
}

export async function deleteSupplierAction(id: string) {
  const user = await requireUser();
  await prisma.supplier.deleteMany({ where: { id, tenantId: user.tenantId } });
  revalidatePath("/fornecedores");
}
