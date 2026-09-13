import { prisma } from "@/lib/prisma";
import { currentMonthStartISO, monthRange } from "@/lib/format";

/**
 * Painel de controle do fiado (pedido do dono: "igual ao Crédito Eficaz" —
 * pra quem vendi fiado, quem está devendo, o que está vencido). Só leitura:
 * receber continua na ficha do cliente (`receiveFiadoPayment`).
 * "Vencido" nunca é gravado — é PENDENTE com vencimento no passado (ver
 * `isFiadoOverdue`).
 */

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type FiadoCustomerRow = {
  customerId: string;
  name: string;
  phone: string | null;
  openAmount: number;
  openCount: number;
  overdueAmount: number;
  overdueCount: number;
  /** Vencimento mais próximo entre os pendentes (pode já ter passado). */
  nextDueDate: Date | null;
  paidAmount: number;
  lastFiadoAt: Date | null;
  lastPaymentAt: Date | null;
  lastPaymentMethod: string | null;
};

export type FiadoRecentEntry = {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  status: "PENDING" | "PAID";
  overdue: boolean;
  dueDate: Date | null;
  createdAt: Date;
  paidAt: Date | null;
  paymentMethod: string | null;
  saleId: string | null;
  saleNumber: number | null;
};

export type FiadoOverview = {
  totalOpen: number;
  totalOverdue: number;
  overdueCount: number;
  customersOwing: number;
  /** Fiado lançado no mês corrente (vendido/lançado, pago ou não). */
  soldThisMonth: number;
  /** Fiado recebido no mês corrente (por `paidAt`). */
  receivedThisMonth: number;
  customers: FiadoCustomerRow[];
  recent: FiadoRecentEntry[];
};

export async function getFiadoOverview(tenantId: string, now = new Date()): Promise<FiadoOverview> {
  const month = monthRange(currentMonthStartISO(now));

  const [entries, recentRows] = await Promise.all([
    prisma.fiadoEntry.findMany({
      where: { tenantId },
      select: {
        customerId: true,
        amount: true,
        status: true,
        dueDate: true,
        createdAt: true,
        paidAt: true,
        paymentMethod: true,
        customer: { select: { name: true, phone: true, whatsapp: true } },
      },
    }),
    prisma.fiadoEntry.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        customerId: true,
        amount: true,
        status: true,
        dueDate: true,
        createdAt: true,
        paidAt: true,
        paymentMethod: true,
        saleId: true,
        sale: { select: { number: true } },
        customer: { select: { name: true } },
      },
    }),
  ]);

  const byCustomer = new Map<string, FiadoCustomerRow>();
  let totalOpen = 0;
  let totalOverdue = 0;
  let overdueCount = 0;
  let soldThisMonth = 0;
  let receivedThisMonth = 0;

  for (const entry of entries) {
    const amount = Number(entry.amount);
    const row =
      byCustomer.get(entry.customerId) ??
      ({
        customerId: entry.customerId,
        name: entry.customer.name,
        phone: entry.customer.whatsapp || entry.customer.phone,
        openAmount: 0,
        openCount: 0,
        overdueAmount: 0,
        overdueCount: 0,
        nextDueDate: null,
        paidAmount: 0,
        lastFiadoAt: null,
        lastPaymentAt: null,
        lastPaymentMethod: null,
      } satisfies FiadoCustomerRow);

    if (!row.lastFiadoAt || entry.createdAt > row.lastFiadoAt) row.lastFiadoAt = entry.createdAt;
    if (entry.createdAt >= month.start && entry.createdAt < month.end) soldThisMonth += amount;

    if (entry.status === "PENDING") {
      row.openAmount += amount;
      row.openCount += 1;
      totalOpen += amount;
      if (entry.dueDate && (!row.nextDueDate || entry.dueDate < row.nextDueDate)) row.nextDueDate = entry.dueDate;
      if (entry.dueDate && entry.dueDate < now) {
        row.overdueAmount += amount;
        row.overdueCount += 1;
        totalOverdue += amount;
        overdueCount += 1;
      }
    } else {
      row.paidAmount += amount;
      if (entry.paidAt && (!row.lastPaymentAt || entry.paidAt > row.lastPaymentAt)) {
        row.lastPaymentAt = entry.paidAt;
        row.lastPaymentMethod = entry.paymentMethod;
      }
      if (entry.paidAt && entry.paidAt >= month.start && entry.paidAt < month.end) receivedThisMonth += amount;
    }
    byCustomer.set(entry.customerId, row);
  }

  const customers = [...byCustomer.values()]
    .map((row) => ({
      ...row,
      openAmount: round2(row.openAmount),
      overdueAmount: round2(row.overdueAmount),
      paidAmount: round2(row.paidAmount),
    }))
    // Quem mais deve primeiro — vencido pesa antes do simplesmente em aberto.
    .sort((a, b) => b.overdueAmount - a.overdueAmount || b.openAmount - a.openAmount || a.name.localeCompare(b.name));

  return {
    totalOpen: round2(totalOpen),
    totalOverdue: round2(totalOverdue),
    overdueCount,
    customersOwing: customers.filter((c) => c.openAmount > 0).length,
    soldThisMonth: round2(soldThisMonth),
    receivedThisMonth: round2(receivedThisMonth),
    customers,
    recent: recentRows.map((entry) => ({
      id: entry.id,
      customerId: entry.customerId,
      customerName: entry.customer.name,
      amount: Number(entry.amount),
      status: entry.status,
      overdue: entry.status === "PENDING" && !!entry.dueDate && entry.dueDate < now,
      dueDate: entry.dueDate,
      createdAt: entry.createdAt,
      paidAt: entry.paidAt,
      paymentMethod: entry.paymentMethod,
      saleId: entry.saleId,
      saleNumber: entry.sale?.number ?? null,
    })),
  };
}
