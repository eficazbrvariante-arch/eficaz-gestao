"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageCashRegister, canMoveCash } from "@/lib/permissions";
import { getCashSummary, getOpenCashRegister } from "@/modules/cash/cash-service";
import {
  openCashSchema,
  closeCashSchema,
  cashMovementSchema,
  type OpenCashInput,
  type CloseCashInput,
  type CashMovementInput,
} from "@/lib/validations/cash";

function revalidateCashPages() {
  revalidatePath("/caixa");
  revalidatePath("/pdv");
  revalidatePath("/dashboard");
}

export async function openCashRegisterAction(input: OpenCashInput) {
  const user = await requireUser();
  if (!canManageCashRegister(user.role)) {
    return { error: "Seu perfil não tem permissão para abrir o caixa." };
  }

  const parsed = openCashSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  const alreadyOpen = await getOpenCashRegister(user.tenantId);
  if (alreadyOpen) return { error: "Já existe um caixa aberto." };

  await prisma.cashRegister.create({
    data: {
      tenantId: user.tenantId,
      openedById: user.id,
      openingAmount: parsed.data.openingAmount,
      notes: parsed.data.notes || null,
    },
  });

  revalidateCashPages();
  return { success: "Caixa aberto." };
}

export async function closeCashRegisterAction(input: CloseCashInput) {
  const user = await requireUser();
  if (!canManageCashRegister(user.role)) {
    return { error: "Seu perfil não tem permissão para fechar o caixa." };
  }

  const parsed = closeCashSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  const register = await getOpenCashRegister(user.tenantId);
  if (!register) return { error: "Nenhum caixa aberto para fechar." };

  const summary = await getCashSummary(user.tenantId, register.id);

  await prisma.cashRegister.update({
    where: { id: register.id },
    data: {
      status: "CLOSED",
      closedById: user.id,
      closedAt: new Date(),
      countedAmount: parsed.data.countedAmount,
      expectedAmount: summary.expectedInDrawer,
      notes: parsed.data.notes || register.notes,
    },
  });

  revalidateCashPages();
  return { success: "Caixa fechado." };
}

export async function createCashMovementAction(input: CashMovementInput) {
  const user = await requireUser();
  if (!canMoveCash(user.role)) {
    return { error: "Seu perfil não tem permissão para registrar sangria ou suprimento." };
  }

  const parsed = cashMovementSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  const register = await getOpenCashRegister(user.tenantId);
  if (!register) return { error: "Abra o caixa antes de registrar movimentações." };

  if (parsed.data.type === "WITHDRAWAL") {
    const summary = await getCashSummary(user.tenantId, register.id);
    if (parsed.data.amount > summary.expectedInDrawer) {
      return {
        error: "Valor da sangria é maior que o dinheiro disponível no caixa.",
      };
    }
  }

  await prisma.cashMovement.create({
    data: {
      tenantId: user.tenantId,
      cashRegisterId: register.id,
      type: parsed.data.type,
      amount: parsed.data.amount,
      description: parsed.data.description,
      userId: user.id,
    },
  });

  revalidateCashPages();
  return { success: "Movimentação registrada." };
}
