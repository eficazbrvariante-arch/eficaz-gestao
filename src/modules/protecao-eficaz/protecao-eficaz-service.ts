import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isCapinhaCategory, isPeliculaCategory } from "@/lib/seller-discount-rules";

const PROTECTION_WINDOW_DAYS = 30;

/** 30 dias a partir da DATA DA VENDA, nunca da aprovação — ver decisão no plano do módulo. */
export function computeProtectionExpiresAt(saleCreatedAt: Date): Date {
  const expires = new Date(saleCreatedAt);
  expires.setDate(expires.getDate() + PROTECTION_WINDOW_DAYS);
  return expires;
}

export type SubmitProtecaoEficazResult = { ok: true } | { ok: false; error: string };

/**
 * Cliente registra o cadastro de validação — sem checar aqui se a venda
 * bate/existe/é elegível (isso é o trabalho do Admin na aprovação manual).
 * Só garante que a mesma venda não seja cadastrada duas vezes
 * (`@@unique([tenantId, saleNumber])`).
 */
export async function submitProtecaoEficazRegistration(
  tenantId: string,
  customerId: string,
  input: { saleNumber: number; proofPhotoUrl: string }
): Promise<SubmitProtecaoEficazResult> {
  try {
    await prisma.protecaoEficaz.create({
      data: {
        tenantId,
        customerId,
        saleNumber: input.saleNumber,
        proofPhotoUrl: input.proofPhotoUrl,
        termsAcceptedAt: new Date(),
      },
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: `A venda #${input.saleNumber} já foi cadastrada.` };
    }
    throw error;
  }
}

export type CustomerProtecaoEficazRow = {
  id: string;
  saleNumber: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  protectionExpiresAt: Date | null;
  redeemedAt: Date | null;
  createdAt: Date;
};

/** Lista pro cliente em `/conta` — só o status, nunca a tela de comparação (essa é exclusiva do Admin). */
export async function listCustomerProtecaoEficaz(
  tenantId: string,
  customerId: string
): Promise<CustomerProtecaoEficazRow[]> {
  return prisma.protecaoEficaz.findMany({
    where: { tenantId, customerId },
    select: {
      id: true,
      saleNumber: true,
      status: true,
      rejectionReason: true,
      protectionExpiresAt: true,
      redeemedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export type ProtecaoEficazSaleSnapshot = {
  found: boolean;
  createdAt: Date | null;
  sellerName: string | null;
  hasCapinha: boolean;
  hasPelicula: boolean;
  protecaoEficazOptedIn: boolean;
  items: { name: string; quantity: number; unitPrice: number; total: number }[];
  total: number;
};

/** Rascunho da venda no sistema, pra comparação lado a lado com a foto do cliente na aprovação manual. */
async function loadSaleSnapshot(tenantId: string, saleNumber: number): Promise<ProtecaoEficazSaleSnapshot> {
  const sale = await prisma.sale.findUnique({
    where: { tenantId_number: { tenantId, number: saleNumber } },
    select: {
      createdAt: true,
      total: true,
      protecaoEficazOptedIn: true,
      seller: { select: { name: true } },
      items: {
        select: {
          nameSnapshot: true,
          quantity: true,
          unitPrice: true,
          total: true,
          product: { select: { category: { select: { name: true } } } },
        },
      },
    },
  });

  if (!sale) {
    return {
      found: false,
      createdAt: null,
      sellerName: null,
      hasCapinha: false,
      hasPelicula: false,
      protecaoEficazOptedIn: false,
      items: [],
      total: 0,
    };
  }

  return {
    found: true,
    createdAt: sale.createdAt,
    sellerName: sale.seller.name,
    hasCapinha: sale.items.some((item) => isCapinhaCategory(item.product.category?.name)),
    hasPelicula: sale.items.some((item) => isPeliculaCategory(item.product.category?.name)),
    protecaoEficazOptedIn: sale.protecaoEficazOptedIn,
    items: sale.items.map((item) => ({
      name: item.nameSnapshot,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
    })),
    total: Number(sale.total),
  };
}

export type AdminProtecaoEficazRow = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  saleNumber: number;
  proofPhotoUrl: string;
  rejectionReason: string | null;
  protectionExpiresAt: Date | null;
  redeemedAt: Date | null;
  createdAt: Date;
  customerName: string;
  customerPhone: string | null;
  sale: ProtecaoEficazSaleSnapshot;
};

/** Fila do Admin — cada linha já vem com o rascunho da venda pra comparação (ver `loadSaleSnapshot`). */
export async function listProtecaoEficazForAdmin(tenantId: string): Promise<AdminProtecaoEficazRow[]> {
  const registrations = await prisma.protecaoEficaz.findMany({
    where: { tenantId },
    select: {
      id: true,
      status: true,
      saleNumber: true,
      proofPhotoUrl: true,
      rejectionReason: true,
      protectionExpiresAt: true,
      redeemedAt: true,
      createdAt: true,
      customer: { select: { name: true, phone: true, whatsapp: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return Promise.all(
    registrations.map(async (registration) => ({
      id: registration.id,
      status: registration.status,
      saleNumber: registration.saleNumber,
      proofPhotoUrl: registration.proofPhotoUrl,
      rejectionReason: registration.rejectionReason,
      protectionExpiresAt: registration.protectionExpiresAt,
      redeemedAt: registration.redeemedAt,
      createdAt: registration.createdAt,
      customerName: registration.customer.name,
      customerPhone: registration.customer.phone || registration.customer.whatsapp,
      sale: await loadSaleSnapshot(tenantId, registration.saleNumber),
    }))
  );
}

export type ReviewProtecaoEficazResult = { ok: true } | { ok: false; error: string };

/** Aprova: exige que a venda exista de verdade (é dela que sai o prazo de 30 dias). */
export async function approveProtecaoEficaz(
  tenantId: string,
  registrationId: string,
  reviewedById: string
): Promise<ReviewProtecaoEficazResult> {
  const registration = await prisma.protecaoEficaz.findFirst({
    where: { id: registrationId, tenantId },
    select: { saleNumber: true, status: true },
  });
  if (!registration) return { ok: false, error: "Cadastro não encontrado." };
  if (registration.status !== "PENDING") return { ok: false, error: "Este cadastro já foi analisado." };

  const sale = await prisma.sale.findUnique({
    where: { tenantId_number: { tenantId, number: registration.saleNumber } },
    select: { createdAt: true },
  });
  if (!sale) {
    return {
      ok: false,
      error: `Venda #${registration.saleNumber} não encontrada — rejeite se o número estiver errado.`,
    };
  }

  await prisma.protecaoEficaz.update({
    where: { id: registrationId },
    data: {
      status: "APPROVED",
      reviewedById,
      reviewedAt: new Date(),
      protectionExpiresAt: computeProtectionExpiresAt(sale.createdAt),
      rejectionReason: null,
    },
  });
  return { ok: true };
}

export async function rejectProtecaoEficaz(
  tenantId: string,
  registrationId: string,
  reviewedById: string,
  reason: string
): Promise<ReviewProtecaoEficazResult> {
  const registration = await prisma.protecaoEficaz.findFirst({
    where: { id: registrationId, tenantId },
    select: { status: true },
  });
  if (!registration) return { ok: false, error: "Cadastro não encontrado." };
  if (registration.status !== "PENDING") return { ok: false, error: "Este cadastro já foi analisado." };

  await prisma.protecaoEficaz.update({
    where: { id: registrationId },
    data: {
      status: "REJECTED",
      reviewedById,
      reviewedAt: new Date(),
      rejectionReason: reason || null,
    },
  });
  return { ok: true };
}

/** Marca que o cliente já veio trocar a película de verdade — trava o registro contra reuso. */
export async function markProtecaoEficazRedeemed(
  tenantId: string,
  registrationId: string,
  redeemedById: string
): Promise<ReviewProtecaoEficazResult> {
  const registration = await prisma.protecaoEficaz.findFirst({
    where: { id: registrationId, tenantId },
    select: { status: true, redeemedAt: true },
  });
  if (!registration) return { ok: false, error: "Cadastro não encontrado." };
  if (registration.status !== "APPROVED") return { ok: false, error: "Só cadastros aprovados podem ser trocados." };
  if (registration.redeemedAt) return { ok: false, error: "Esta troca já foi registrada." };

  await prisma.protecaoEficaz.update({
    where: { id: registrationId },
    data: { redeemedAt: new Date(), redeemedById },
  });
  return { ok: true };
}
