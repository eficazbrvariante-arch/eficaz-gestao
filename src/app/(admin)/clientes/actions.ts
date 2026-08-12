"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageFiado } from "@/lib/permissions";
import { customerSchema, type CustomerInput } from "@/lib/validations/customer";
import { passwordSchema } from "@/lib/validations/customer-auth";
import {
  createFiadoEntrySchema,
  grantStoreCreditSchema,
  type CreateFiadoEntryInput,
  type GrantStoreCreditInput,
} from "@/lib/validations/fiado";
import {
  adminSetCustomerPassword,
  generateRandomPassword,
  grantManualStoreCredit,
} from "@/modules/customers/customer-service";
import { createFiadoEntry, markFiadoEntryPaid } from "@/modules/fiado/fiado-service";
import { buildWhatsappLink } from "@/lib/whatsapp";

/** `YYYY-MM-DD` (fuso de Brasília) para `Date`, ao meio-dia para não escorregar de dia. */
function parseDateOnly(value: string | undefined) {
  if (!value) return null;
  return new Date(`${value}T12:00:00-03:00`);
}

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
    birthDate: parseDateOnly(data.birthDate),
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

/** Lojista define a senha manualmente (ex.: cliente ligou pedindo ajuda). */
export async function adminSetCustomerPasswordAction(customerId: string, newPassword: string) {
  const user = await requireUser();
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Senha inválida." };

  const result = await adminSetCustomerPassword(user.tenantId, customerId, parsed.data);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/clientes/${customerId}`);
  return { success: "Senha definida com sucesso." };
}

/**
 * Gera uma senha aleatória, já grava no cliente, e devolve o link do
 * WhatsApp pronto — quem manda a mensagem de fato é o lojista, clicando
 * "Enviar" no próprio WhatsApp (mesmo padrão do link de pedido, não há
 * envio automático). Se o lojista fechar sem enviar, a senha nova já foi
 * gravada; ele pode gerar outra a qualquer momento.
 */
export async function adminGenerateAndSendPasswordAction(customerId: string) {
  const user = await requireUser();
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: user.tenantId },
    select: { name: true, whatsapp: true, phone: true, username: true },
  });
  if (!customer) return { error: "Cliente não encontrado." };
  if (!customer.username) return { error: "Este cliente não tem login na loja online." };

  const waPhone = customer.whatsapp || customer.phone;
  if (!waPhone) return { error: "Cliente sem WhatsApp/telefone cadastrado." };

  const newPassword = generateRandomPassword();
  const result = await adminSetCustomerPassword(user.tenantId, customerId, newPassword);
  if (!result.ok) return { error: result.error };

  const message = [
    `Olá, ${customer.name}! Sua senha de acesso à loja foi redefinida.`,
    "",
    `*Usuário:* @${customer.username}`,
    `*Nova senha:* ${newPassword}`,
    "",
    `Recomendamos trocar essa senha assim que entrar em "Minha conta".`,
  ].join("\n");

  revalidatePath(`/clientes/${customerId}`);
  return { success: true as const, whatsappLink: buildWhatsappLink(waPhone, message) };
}

/** Busca rápida usada pelo seletor de cliente no PDV. */
export async function searchCustomersAction(query: string) {
  const user = await requireUser();
  const term = query.trim();
  if (term.length < 2) return [];

  const customers = await prisma.customer.findMany({
    where: {
      tenantId: user.tenantId,
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { document: { contains: term, mode: "insensitive" } },
        { phone: { contains: term, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, document: true, phone: true, creditBalance: true },
    orderBy: { name: "asc" },
    take: 10,
  });

  return customers.map((c) => ({ ...c, creditBalance: Number(c.creditBalance) }));
}

/** Lança um fiado manual (fora do PDV, ex.: produto entregue sem passar pela venda). Só ADMIN. */
export async function createFiadoEntryAction(customerId: string, input: CreateFiadoEntryInput) {
  const user = await requireUser();
  if (!canManageFiado(user.role)) {
    return { error: "Seu perfil não tem permissão para lançar fiado." };
  }

  const parsed = createFiadoEntrySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!customer) return { error: "Cliente não encontrado." };

  await createFiadoEntry(user.tenantId, {
    customerId,
    amount: parsed.data.amount,
    dueDate: parsed.data.dueDate,
    note: parsed.data.note || null,
    createdById: user.id,
  });

  revalidatePath(`/clientes/${customerId}`);
  return { success: true as const };
}

/** Marca um lançamento de fiado como pago. Só ADMIN. */
export async function markFiadoEntryPaidAction(customerId: string, entryId: string) {
  const user = await requireUser();
  if (!canManageFiado(user.role)) {
    return { error: "Seu perfil não tem permissão para gerenciar fiado." };
  }

  const result = await markFiadoEntryPaid(user.tenantId, entryId);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/clientes/${customerId}`);
  return { success: true as const };
}

/** Concede crédito de loja manualmente (ex.: crédito positivo de um fiado). Só ADMIN. */
export async function grantStoreCreditAction(customerId: string, input: GrantStoreCreditInput) {
  const user = await requireUser();
  if (!canManageFiado(user.role)) {
    return { error: "Seu perfil não tem permissão para conceder crédito." };
  }

  const parsed = grantStoreCreditSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const result = await grantManualStoreCredit(
    user.tenantId,
    customerId,
    parsed.data.amount,
    parsed.data.reason,
    user.id
  );
  if (!result.ok) return { error: result.error };

  revalidatePath(`/clientes/${customerId}`);
  return { success: true as const };
}
