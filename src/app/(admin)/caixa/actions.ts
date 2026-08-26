"use server";

import { revalidatePath } from "next/cache";
import { signOut } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  canCloseCashRegisterDirectly,
  canEditClosedCashRegister,
  canFinalizeCashRegisterReview,
  canManageCashRegister,
  canMoveCash,
} from "@/lib/permissions";
import {
  editClosedCashRegister,
  finalizeCashRegisterReview,
  getCashSummary,
  getOpenCashRegister,
  submitCashRegisterForReview,
} from "@/modules/cash/cash-service";
import {
  openCashSchema,
  closeCashSchema,
  submitCashForReviewSchema,
  finalizeCashReviewSchema,
  editCashRegisterSchema,
  cashMovementSchema,
  type OpenCashInput,
  type CloseCashInput,
  type SubmitCashForReviewInput,
  type FinalizeCashReviewInput,
  type EditCashRegisterInput,
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
  if (!canCloseCashRegisterDirectly(user.role)) {
    return { error: "Seu perfil não tem permissão para fechar o caixa direto — envie a contagem para revisão." };
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
      countedDebitAmount: parsed.data.countedDebitAmount,
      // Inclui recebimentos de Assistência Técnica, igual ao card exibido
      // na tela — `debitSales`/`creditSales`/`pixSales` sozinhos (só PDV)
      // subestimavam o esperado em lojas com pagamento de OS no cartão/Pix.
      expectedDebitAmount: summary.totalDebit,
      countedCreditAmount: parsed.data.countedCreditAmount,
      expectedCreditAmount: summary.totalCredit,
      countedPixAmount: parsed.data.countedPixAmount,
      expectedPixAmount: summary.totalPix,
      notes: parsed.data.notes || register.notes,
    },
  });

  revalidateCashPages();
  // Desloga quem fechou o caixa na hora — o terminal físico é compartilhado
  // entre turnos, então o próximo a usar precisa logar com o próprio usuário,
  // não continuar na sessão de quem acabou de fechar.
  await signOut({ redirectTo: "/login" });
}

/**
 * Vendedor envia a contagem às cegas (só dinheiro, sem ver o esperado) mais
 * as fotos dos comprovantes da maquininha — não fecha o caixa, deixa
 * `PENDING_REVIEW` até o Admin finalizar (ver `finalizeCashRegisterReviewAction`).
 */
export async function submitCashRegisterForReviewAction(input: SubmitCashForReviewInput) {
  const user = await requireUser();
  if (!canManageCashRegister(user.role)) {
    return { error: "Seu perfil não tem permissão para fechar o caixa." };
  }

  const parsed = submitCashForReviewSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const register = await getOpenCashRegister(user.tenantId);
  if (!register) return { error: "Nenhum caixa aberto para fechar." };

  const result = await submitCashRegisterForReview(
    { tenantId: user.tenantId, userId: user.id },
    { registerId: register.id, ...parsed.data }
  );
  if (!result.ok) return { error: result.error };

  revalidateCashPages();
  // Mesmo motivo do fechamento direto: terminal compartilhado, próximo turno
  // precisa logar com o próprio usuário.
  await signOut({ redirectTo: "/login" });
}

/** Só ADMIN — finaliza de vez um caixa enviado pra revisão. */
export async function finalizeCashRegisterReviewAction(input: FinalizeCashReviewInput) {
  const user = await requireUser();
  if (!canFinalizeCashRegisterReview(user.role)) {
    return { error: "Seu perfil não tem permissão para finalizar o fechamento do caixa." };
  }

  const parsed = finalizeCashReviewSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  const result = await finalizeCashRegisterReview({ tenantId: user.tenantId, userId: user.id }, parsed.data);
  if (!result.ok) return { error: result.error };

  revalidatePath("/caixa/historico");
  revalidatePath(`/caixa/historico/${parsed.data.registerId}`);
  return { success: "Fechamento finalizado." };
}

/** Só ADMIN — corrige os valores conferidos de um caixa já fechado. */
export async function editCashRegisterAction(input: EditCashRegisterInput) {
  const user = await requireUser();
  if (!canEditClosedCashRegister(user.role)) {
    return { error: "Seu perfil não tem permissão para editar um caixa já fechado." };
  }

  const parsed = editCashRegisterSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  const result = await editClosedCashRegister(
    { tenantId: user.tenantId, userId: user.id, userName: user.name ?? user.email ?? "Usuário" },
    parsed.data
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/caixa/historico");
  revalidatePath(`/caixa/historico/${parsed.data.registerId}`);
  return { success: "Caixa atualizado." };
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
