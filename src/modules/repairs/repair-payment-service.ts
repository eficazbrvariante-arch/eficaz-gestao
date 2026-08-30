import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { createFiadoEntry } from "@/modules/fiado/fiado-service";
import { repairOrderTotal } from "./repair-order-service";
import {
  verifyCreditoEficazPin,
  computeCreditoEficazDueDate,
  financeRepairOrderBalanceInTx,
  reverseServiceFinancingInTx,
} from "@/modules/credito-eficaz/credito-eficaz-service";

/** Tolerância para comparação de valores monetários (evita ruído de ponto flutuante). */
const CENT = 0.005;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type RepairOrderPaymentEntry = { method: PaymentMethod; amount: number };

export type RepairOrderFinancials = {
  total: number;
  paid: number;
  balance: number;
  situation: "QUITADO" | "PENDENTE" | "SEM_COBRANCA";
  payments: {
    id: string;
    method: PaymentMethod;
    amount: number;
    createdAt: Date;
    createdByName: string;
  }[];
};

/**
 * Resumo financeiro de uma OS — total e saldo nunca são persistidos, sempre
 * recalculados a partir dos itens/desconto atuais e da soma dos recebimentos
 * já registrados (mesmo princípio que o resto do módulo já usa pro total).
 */
export async function getRepairOrderFinancials(
  tenantId: string,
  repairOrderId: string
): Promise<RepairOrderFinancials | null> {
  const order = await prisma.repairOrder.findFirst({
    where: { id: repairOrderId, tenantId },
    select: {
      discount: true,
      items: { select: { unitPrice: true, quantity: true } },
      payments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          method: true,
          amount: true,
          createdAt: true,
          createdBy: { select: { name: true } },
        },
      },
    },
  });
  if (!order) return null;

  const total = repairOrderTotal(order.items, order.discount);
  const paid = round2(order.payments.reduce((sum, p) => sum + Number(p.amount), 0));
  const balance = round2(Math.max(0, total - paid));

  return {
    total,
    paid,
    balance,
    situation: total === 0 ? "SEM_COBRANCA" : balance <= CENT ? "QUITADO" : "PENDENTE",
    payments: order.payments.map((p) => ({
      id: p.id,
      method: p.method,
      amount: Number(p.amount),
      createdAt: p.createdAt,
      createdByName: p.createdBy.name,
    })),
  };
}

export type RepairPaymentContext = {
  tenantId: string;
  userId: string;
  /** Nulo quando não há caixa aberto — só é exigido de fato se algum pagamento com dinheiro/cartão/PIX estiver sendo registrado agora (ver `applyRepairOrderPayments`). Uma OS já quitada antes pode ser entregue sem caixa aberto. */
  cashRegisterId: string | null;
  allowFiado: boolean;
};

export type RepairPaymentOptions = {
  /** Obrigatório só quando alguma das entradas é `FIADO`. */
  fiadoDueDate?: string;
  /** Obrigatório só quando alguma das entradas é `CREDITO_EFICAZ` (Adendo). */
  creditoEficazPin?: string;
  /** Nº de parcelas do financiamento — default 1 se não informado. */
  creditoEficazInstallments?: number;
  /** Avaliação opcional do vendedor (Adendo, item 11) — nunca obrigatória. */
  creditoEficazWouldBeLost?: boolean;
};

export type RepairPaymentResult = { ok: true } | { ok: false; error: string };

/**
 * Grava um conjunto de pagamentos contra uma OS, dentro de uma única
 * transação — usada tanto para uma entrada antecipada (durante o
 * atendimento, sem mudar o status) quanto, com `deliver: true`, para o
 * acerto financeiro na entrega (que também muda o status pra `DELIVERED`).
 *
 * O saldo é recalculado DENTRO da transação (não confiando só na checagem
 * feita antes de abri-la) — isso é a proteção contra duplicidade: duas
 * tentativas simultâneas de registrar o mesmo pagamento nunca conseguem as
 * duas "caber" no mesmo saldo, porque a segunda vê o saldo já reduzido pela
 * primeira.
 */
async function applyRepairOrderPayments(
  ctx: RepairPaymentContext,
  repairOrderId: string,
  entries: RepairOrderPaymentEntry[],
  options: RepairPaymentOptions,
  deliver: boolean
): Promise<RepairPaymentResult> {
  const realEntries = entries.filter((e) => e.amount > 0.005);
  const entriesSum = round2(realEntries.reduce((sum, e) => sum + e.amount, 0));

  if (deliver === false && entriesSum <= 0) {
    return { ok: false, error: "Informe ao menos um pagamento." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.repairOrder.findFirstOrThrow({
        where: { id: repairOrderId, tenantId: ctx.tenantId },
        select: {
          number: true,
          status: true,
          customerId: true,
          discount: true,
          items: { select: { unitPrice: true, quantity: true } },
          payments: { select: { amount: true } },
        },
      });

      if (order.status === "CANCELLED") {
        throw new RepairPaymentError("Esta OS está cancelada.");
      }
      if (order.status === "DELIVERED" && deliver) {
        throw new RepairPaymentError("Esta OS já foi entregue.");
      }

      const total = repairOrderTotal(order.items, order.discount);
      const alreadyPaid = round2(order.payments.reduce((sum, p) => sum + Number(p.amount), 0));
      const balance = round2(Math.max(0, total - alreadyPaid));

      if (entriesSum > balance + CENT) {
        throw new RepairPaymentError(
          `Os pagamentos informados (${entriesSum.toFixed(2)}) são maiores que o saldo pendente (${balance.toFixed(2)}).`
        );
      }
      if (deliver && Math.abs(entriesSum - balance) > CENT) {
        throw new RepairPaymentError(
          `Os pagamentos informados (${entriesSum.toFixed(2)}) não fecham com o saldo pendente (${balance.toFixed(2)}).`
        );
      }

      const fiadoAmount = round2(
        realEntries.filter((e) => e.method === "FIADO").reduce((sum, e) => sum + e.amount, 0)
      );
      if (fiadoAmount > 0) {
        if (!ctx.allowFiado) {
          throw new RepairPaymentError("Seu perfil não tem permissão para vender fiado.");
        }
        if (!order.customerId) {
          throw new RepairPaymentError("Selecione um cliente para vender fiado.");
        }
        if (!options.fiadoDueDate) {
          throw new RepairPaymentError("Informe a data prevista de pagamento do fiado.");
        }
      }

      const creditoEficazAmount = round2(
        realEntries.filter((e) => e.method === "CREDITO_EFICAZ").reduce((sum, e) => sum + e.amount, 0)
      );
      if (creditoEficazAmount > 0) {
        if (!order.customerId) {
          throw new RepairPaymentError("Selecione um cliente para usar o Crédito Eficaz.");
        }
        if (!options.creditoEficazPin) {
          throw new RepairPaymentError("Informe o PIN do Crédito Eficaz.");
        }
        const pinValid = await verifyCreditoEficazPin(ctx.tenantId, order.customerId, options.creditoEficazPin);
        if (!pinValid) {
          throw new RepairPaymentError("PIN do Crédito Eficaz incorreto.");
        }
      }

      const storeCreditAmount = round2(
        realEntries.filter((e) => e.method === "STORE_CREDIT").reduce((sum, e) => sum + e.amount, 0)
      );
      if (storeCreditAmount > 0) {
        if (!order.customerId) {
          throw new RepairPaymentError("Selecione um cliente para usar crédito de loja.");
        }
        const customer = await tx.customer.findFirstOrThrow({
          where: { id: order.customerId, tenantId: ctx.tenantId },
          select: { creditBalance: true },
        });
        const customerCreditBalance = Number(customer.creditBalance);
        if (storeCreditAmount > customerCreditBalance + CENT) {
          throw new RepairPaymentError(
            `Crédito de loja insuficiente. Saldo disponível: ${customerCreditBalance.toFixed(2)}.`
          );
        }
      }

      if (realEntries.length > 0) {
        if (!ctx.cashRegisterId) {
          throw new RepairPaymentError("Abra o caixa antes de receber pagamentos.");
        }
        // O PDF cacheado (se existir) fica desatualizado assim que um
        // pagamento novo entra — força regeração na próxima vez que alguém
        // pedir o comprovante (ver `receiptPdfUrl` em `receipt-service.tsx`).
        await tx.repairOrder.update({
          where: { id: repairOrderId },
          data: { receiptPdfUrl: null },
        });
        await tx.repairOrderPayment.createMany({
          data: realEntries.map((e) => ({
            tenantId: ctx.tenantId,
            repairOrderId,
            cashRegisterId: ctx.cashRegisterId as string,
            method: e.method,
            amount: round2(e.amount),
            createdById: ctx.userId,
          })),
        });

        await tx.repairOrderEvent.create({
          data: {
            repairOrderId,
            message: `Pagamento recebido: ${formatBRL(entriesSum)} (${realEntries
              .map((e) => PAYMENT_METHOD_LABELS[e.method])
              .join(", ")})`,
          },
        });
      }

      if (storeCreditAmount > 0 && order.customerId) {
        await tx.customer.update({
          where: { id: order.customerId },
          data: { creditBalance: { decrement: storeCreditAmount } },
        });
        await tx.customerCreditMovement.create({
          data: {
            tenantId: ctx.tenantId,
            customerId: order.customerId,
            type: "REDEEMED",
            amount: storeCreditAmount,
            userId: ctx.userId,
            reason: `Usado no acerto financeiro da OS #${order.number}`,
          },
        });
      }

      if (fiadoAmount > 0 && order.customerId) {
        await createFiadoEntry(
          ctx.tenantId,
          {
            customerId: order.customerId,
            amount: fiadoAmount,
            dueDate: options.fiadoDueDate,
            repairOrderId,
            createdById: ctx.userId,
            note: `Saldo da OS #${order.number}`,
          },
          tx
        );
      }

      if (creditoEficazAmount > 0 && order.customerId) {
        // Entrada = tudo que não veio do Crédito Eficaz (já pago antes +
        // pago nesta mesma rodada) — sempre bate com `total - financedAmount`,
        // inclusive quando a entrada foi registrada dias antes, num
        // `receiveRepairOrderPayment` separado (ver `applyRepairOrderPayments`).
        const downPayment = round2(total - creditoEficazAmount);
        const installmentCount = Math.max(1, options.creditoEficazInstallments ?? 1);
        const baseDueDate = await computeCreditoEficazDueDate(ctx.tenantId, order.customerId);
        const perInstallment = round2(creditoEficazAmount / installmentCount);
        const installments = Array.from({ length: installmentCount }, (_, index) => ({
          amount:
            index === installmentCount - 1
              ? round2(creditoEficazAmount - perInstallment * (installmentCount - 1))
              : perInstallment,
          dueDate: new Date(baseDueDate.getTime() + index * 30 * 24 * 60 * 60 * 1000),
        }));

        const financed = await financeRepairOrderBalanceInTx(tx, {
          tenantId: ctx.tenantId,
          customerId: order.customerId,
          repairOrderId,
          totalAmount: total,
          downPayment,
          installments,
          createdById: ctx.userId,
          wouldBeLostWithoutCredit: options.creditoEficazWouldBeLost ?? null,
        });
        if (!financed.ok) throw new RepairPaymentError(financed.error);
      }

      if (deliver) {
        await tx.repairOrder.update({
          where: { id: repairOrderId },
          data: {
            status: "DELIVERED",
            pickedUpAt: new Date(),
            deliveredById: ctx.userId,
            receiptPdfUrl: null,
          },
        });
        await tx.repairOrderEvent.create({
          data: {
            repairOrderId,
            message: `Status alterado para "Entregue"`,
          },
        });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { ok: true };
  } catch (error) {
    if (error instanceof RepairPaymentError) return { ok: false, error: error.message };
    // Sob isolamento Serializable, duas tentativas concorrentes de pagamento
    // podem colidir de propósito (proteção contra recebimento duplicado — ver
    // teste "duas tentativas concorrentes" no script de missão) — o Postgres
    // aborta uma delas com erro de serialização, que cai aqui como genérico:
    // a mensagem já orienta a tentar de novo, e nesse ponto o saldo já reflete
    // só o pagamento que realmente passou.
    return { ok: false, error: "Não foi possível registrar o pagamento. Tente novamente." };
  }
}

class RepairPaymentError extends Error {}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  DEBIT: "Cartão de Débito",
  CREDIT: "Cartão de Crédito",
  STORE_CREDIT: "Crédito de loja",
  FIADO: "Fiado",
  CREDITO_EFICAZ: "Crédito Eficaz",
};

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Entrada antecipada (ou qualquer recebimento parcial) — não muda o status da OS. */
export async function receiveRepairOrderPayment(
  ctx: RepairPaymentContext,
  repairOrderId: string,
  entries: RepairOrderPaymentEntry[],
  options: RepairPaymentOptions = {}
): Promise<RepairPaymentResult> {
  return applyRepairOrderPayments(ctx, repairOrderId, entries, options, false);
}

/**
 * Acerto financeiro da entrega: recebe o saldo restante (pode ser uma lista
 * vazia se o saldo já estiver zerado) e, na mesma transação, marca a OS como
 * `DELIVERED`. É o ÚNICO caminho que leva uma OS a "Entregue" — ver o guard
 * em `updateRepairOrderStatus`.
 */
export async function deliverRepairOrder(
  ctx: RepairPaymentContext,
  repairOrderId: string,
  entries: RepairOrderPaymentEntry[],
  options: RepairPaymentOptions = {}
): Promise<RepairPaymentResult> {
  return applyRepairOrderPayments(ctx, repairOrderId, entries, options, true);
}

export type CourtesyResult = { ok: true } | { ok: false; error: string };

/**
 * Cortesia administrativa: dispensa o saldo restante aumentando o `discount`
 * da OS (não gera um "pagamento" falso, que inflaria os relatórios de
 * faturamento). Só quem tem `canGrantRepairOrderCourtesy` chega a chamar
 * isso — a permissão é checada na action, não aqui.
 *
 * Adendo (Crédito Eficaz): uma OS financiada já fecha o `balance` da OS na
 * hora (mesmo padrão de FIADO — a `RepairOrderPayment` de
 * `CREDITO_EFICAZ` cobre o valor cheio), então a trava normal de "sem saldo
 * pendente" não se aplica a ela. Cortesia numa OS financiada significa
 * outra coisa: perdoar as parcelas ainda em aberto (`reverseServiceFinancingInTx`),
 * nunca mexe no `discount` da OS (que já reflete o valor cheio faturado).
 */
export async function grantRepairOrderCourtesy(
  ctx: { tenantId: string; userId: string },
  repairOrderId: string,
  reason: string
): Promise<CourtesyResult> {
  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.repairOrder.findFirstOrThrow({
        where: { id: repairOrderId, tenantId: ctx.tenantId },
        select: {
          status: true,
          discount: true,
          items: { select: { unitPrice: true, quantity: true } },
          payments: { select: { amount: true } },
        },
      });

      if (order.status === "CANCELLED") {
        throw new RepairPaymentError("Esta OS está cancelada.");
      }

      const total = repairOrderTotal(order.items, order.discount);
      const alreadyPaid = round2(order.payments.reduce((sum, p) => sum + Number(p.amount), 0));
      const balance = round2(Math.max(0, total - alreadyPaid));

      const financing = await tx.creditoEficazServiceFinancing.findFirst({
        where: { tenantId: ctx.tenantId, repairOrderId },
        select: { id: true },
      });
      const openInstallments = financing
        ? await tx.creditoEficazUsage.count({ where: { financingId: financing.id, status: "OPEN" } })
        : 0;

      if (balance <= CENT && openInstallments === 0) {
        throw new RepairPaymentError("Esta OS não tem saldo pendente para dar cortesia.");
      }

      if (openInstallments > 0) {
        // OS já financiada (balance já fechado pelo pagamento de Crédito
        // Eficaz) — cortesia aqui perdoa as parcelas ainda não pagas, nunca
        // mexe no `discount` (o valor faturado da OS continua o mesmo).
        await reverseServiceFinancingInTx(tx, ctx.tenantId, repairOrderId);
        await tx.repairOrderEvent.create({
          data: {
            repairOrderId,
            message: `Cortesia administrativa: parcelas de Crédito Eficaz em aberto perdoadas. Motivo: ${reason}`,
          },
        });
        return;
      }

      const newDiscount = round2(Number(order.discount) + balance);

      await tx.repairOrder.update({
        where: { id: repairOrderId },
        data: { discount: newDiscount, receiptPdfUrl: null },
      });
      await tx.repairOrderEvent.create({
        data: {
          repairOrderId,
          message: `Cortesia administrativa concedida: ${formatBRL(balance)}. Motivo: ${reason}`,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { ok: true };
  } catch (error) {
    if (error instanceof RepairPaymentError) return { ok: false, error: error.message };
    return { ok: false, error: "Não foi possível conceder a cortesia. Tente novamente." };
  }
}

export type CancelRepairOrderResult = { ok: true } | { ok: false; error: string };

/**
 * Cancela a OS sem faturamento — pra quando o cliente não autoriza o serviço
 * e retira o aparelho sem gastar nada. Zera o total (aumenta o `discount`
 * até cobrir o valor dos serviços) pra o comprovante sair R$ 0,00, e exige
 * `deliveredById` (nunca o usuário logado, mesma regra de `sellerId`/
 * `deliverRepairOrder`) — sempre fica registrado quem devolveu o aparelho,
 * mesmo sem cobrança nenhuma. Bloqueada se já houver pagamento registrado
 * nesta OS (nesse caso o valor já recebido precisa de estorno/cortesia, não
 * de um cancelamento que faria o dinheiro desaparecer dos relatórios sem
 * deixar rastro). Só quem tem `canGrantRepairOrderCourtesy` chega a chamar
 * isso — a permissão é checada na action, não aqui.
 */
export async function cancelRepairOrderWithoutBilling(
  ctx: { tenantId: string; userId: string },
  repairOrderId: string,
  deliveredById: string,
  reason: string
): Promise<CancelRepairOrderResult> {
  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.repairOrder.findFirstOrThrow({
        where: { id: repairOrderId, tenantId: ctx.tenantId },
        select: {
          status: true,
          discount: true,
          items: { select: { unitPrice: true, quantity: true } },
          payments: { select: { amount: true } },
        },
      });

      if (order.status === "CANCELLED") {
        throw new RepairPaymentError("Esta OS já está cancelada.");
      }
      if (order.status === "DELIVERED") {
        throw new RepairPaymentError("Esta OS já foi entregue e não pode ser cancelada.");
      }

      const alreadyPaid = round2(order.payments.reduce((sum, p) => sum + Number(p.amount), 0));
      if (alreadyPaid > CENT) {
        throw new RepairPaymentError(
          "Esta OS já tem pagamento registrado — não é possível cancelar sem faturamento."
        );
      }

      const total = repairOrderTotal(order.items, order.discount);
      const newDiscount = round2(Number(order.discount) + total);

      await tx.repairOrder.update({
        where: { id: repairOrderId },
        data: {
          status: "CANCELLED",
          discount: newDiscount,
          pickedUpAt: new Date(),
          deliveredById,
          receiptPdfUrl: null,
        },
      });
      await tx.repairOrderEvent.create({
        data: {
          repairOrderId,
          message: `OS cancelada sem faturamento — aparelho devolvido ao cliente. Motivo: ${reason}`,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { ok: true };
  } catch (error) {
    if (error instanceof RepairPaymentError) return { ok: false, error: error.message };
    return { ok: false, error: "Não foi possível cancelar a ordem de serviço. Tente novamente." };
  }
}
