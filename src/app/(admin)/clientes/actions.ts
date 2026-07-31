"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { customerSchema, type CustomerInput } from "@/lib/validations/customer";

function normalize(data: CustomerInput) {
  return {
    name: data.name,
    document: data.document || null,
    phone: data.phone || null,
    whatsapp: data.whatsapp || null,
    email: data.email || null,
    addressStreet: data.addressStreet || null,
    addressNumber: data.addressNumber || null,
    addressCity: data.addressCity || null,
    addressState: data.addressState || null,
    addressZip: data.addressZip || null,
    notes: data.notes || null,
  };
}

export async function createCustomerAction(input: CustomerInput) {
  const user = await requireUser();
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  await prisma.customer.create({
    data: { tenantId: user.tenantId, ...normalize(parsed.data) },
  });

  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function updateCustomerAction(id: string, input: CustomerInput) {
  const user = await requireUser();
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  const result = await prisma.customer.updateMany({
    where: { id, tenantId: user.tenantId },
    data: normalize(parsed.data),
  });
  if (result.count === 0) return { error: "Cliente não encontrado." };

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
  redirect("/clientes");
}

export async function deleteCustomerAction(id: string) {
  const user = await requireUser();
  await prisma.customer.deleteMany({ where: { id, tenantId: user.tenantId } });
  revalidatePath("/clientes");
}

/** Busca rápida usada pelo seletor de cliente no PDV. */
export async function searchCustomersAction(query: string) {
  const user = await requireUser();
  const term = query.trim();
  if (term.length < 2) return [];

  return prisma.customer.findMany({
    where: {
      tenantId: user.tenantId,
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { document: { contains: term, mode: "insensitive" } },
        { phone: { contains: term, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, document: true, phone: true },
    orderBy: { name: "asc" },
    take: 10,
  });
}
