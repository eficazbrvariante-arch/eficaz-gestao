import { stringify } from "csv-stringify/sync";
import { requireUser } from "@/lib/session";
import { canViewReports } from "@/lib/permissions";
import { formatDateTime, formatISODate } from "@/lib/format";
import { ORDER_PAYMENT_LABELS } from "@/modules/orders/order-status";
import {
  getSalesSummary,
  getDailyRevenue,
  getRevenueByPaymentMethod,
  getRevenueBySeller,
  getProductPerformance,
  getStaleProducts,
  getCancellations,
  getCashRegisterReport,
  type Period,
} from "@/modules/reports/report-service";
import { resolvePeriod } from "../period";

/**
 * O Excel em português usa `;` como separador e espera vírgula decimal.
 * Exportar com ponto e vírgula evita que o usuário precise reconfigurar a
 * importação a cada arquivo.
 */
const CSV_OPTIONS = { delimiter: ";" } as const;

/** Número no formato brasileiro, para o Excel reconhecer como número. */
function num(value: number) {
  return value.toFixed(2).replace(".", ",");
}

type Section = { title: string; rows: (string | number)[][] };

function buildCsv(sections: Section[]) {
  const lines: string[] = [];
  for (const section of sections) {
    lines.push(stringify([[section.title]], CSV_OPTIONS).trimEnd());
    if (section.rows.length > 0) {
      lines.push(stringify(section.rows, CSV_OPTIONS).trimEnd());
    }
    lines.push("");
  }
  // BOM para o Excel abrir os acentos corretamente.
  return `﻿${lines.join("\n")}`;
}

async function salesReport(tenantId: string, period: Period): Promise<Section[]> {
  const [summary, daily, byPayment, bySeller, cancellations] = await Promise.all([
    getSalesSummary(tenantId, period),
    getDailyRevenue(tenantId, period),
    getRevenueByPaymentMethod(tenantId, period),
    getRevenueBySeller(tenantId, period),
    getCancellations(tenantId, period),
  ]);

  return [
    {
      title: "RESUMO",
      rows: [
        ["Indicador", "Valor"],
        ["Faturamento", num(summary.revenue)],
        ["Custo dos produtos", num(summary.cost)],
        ["Taxas de entrega", num(summary.deliveryFees)],
        ["Lucro bruto", num(summary.grossProfit)],
        ["Margem (%)", num(summary.marginPercent)],
        ["Vendas", summary.orderCount],
        ["Ticket medio", num(summary.averageTicket)],
        ["Faturamento PDV", num(summary.pdvRevenue)],
        ["Vendas PDV", summary.pdvCount],
        ["Faturamento catalogo online", num(summary.onlineRevenue)],
        ["Pedidos online", summary.onlineCount],
        ["Cancelamentos", summary.cancelledCount],
        ["Valor cancelado", num(summary.cancelledValue)],
      ],
    },
    {
      title: "FATURAMENTO DIA A DIA",
      rows: [
        ["Data", "Vendas", "Faturamento"],
        ...daily.map((day) => [formatISODate(day.date), day.count, num(day.revenue)]),
      ],
    },
    {
      title: "POR FORMA DE PAGAMENTO",
      rows: [
        ["Forma", "Quantidade", "Valor"],
        ...byPayment.map((row) => [
          ORDER_PAYMENT_LABELS[row.method] ?? row.method,
          row.count,
          num(row.amount),
        ]),
      ],
    },
    {
      title: "POR VENDEDOR",
      rows: [
        ["Vendedor", "Vendas", "Faturamento"],
        ...bySeller.map((row) => [row.name, row.count, num(row.revenue)]),
      ],
    },
    {
      title: "CANCELAMENTOS",
      rows: [
        ["Origem", "Referencia", "Data", "Motivo", "Responsavel", "Valor"],
        ...cancellations.map((row) => [
          row.origin,
          row.reference,
          formatDateTime(row.date),
          row.reason ?? "",
          row.responsible ?? "",
          num(row.total),
        ]),
      ],
    },
  ];
}

async function productsReport(tenantId: string, period: Period): Promise<Section[]> {
  const [performance, stale] = await Promise.all([
    getProductPerformance(tenantId, period),
    getStaleProducts(tenantId, period),
  ]);

  const sorted = [...performance].sort((a, b) => b.quantity - a.quantity);

  return [
    {
      title: "DESEMPENHO POR PRODUTO",
      rows: [
        ["Produto", "Quantidade", "Faturamento", "Custo", "Lucro", "Margem (%)"],
        ...sorted.map((product) => [
          product.name,
          product.quantity,
          num(product.revenue),
          num(product.cost),
          num(product.profit),
          num(product.marginPercent),
        ]),
      ],
    },
    {
      title: "PRODUTOS PARADOS (com estoque, sem venda no periodo)",
      rows: [
        ["Produto", "Estoque", "Valor parado"],
        ...stale.map((product) => [
          product.name,
          product.stockQty,
          num(product.stockValue),
        ]),
      ],
    },
  ];
}

async function cashReport(tenantId: string, period: Period): Promise<Section[]> {
  const report = await getCashRegisterReport(tenantId, period);

  return [
    {
      title: "RESUMO DO CAIXA",
      rows: [
        ["Indicador", "Valor"],
        ["Caixas abertos", report.registers.length],
        ["Sangrias", num(report.withdrawals)],
        ["Suprimentos", num(report.supplies)],
      ],
    },
    {
      title: "FECHAMENTOS",
      rows: [
        [
          "Abertura",
          "Aberto por",
          "Fechamento",
          "Fechado por",
          "Valor inicial",
          "Vendas",
          "Esperado",
          "Contado",
          "Diferenca",
        ],
        ...report.registers.map((register) => [
          formatDateTime(register.openedAt),
          register.openedBy,
          register.closedAt ? formatDateTime(register.closedAt) : "em aberto",
          register.closedBy ?? "",
          num(register.openingAmount),
          register.salesCount,
          register.expectedAmount === null ? "" : num(register.expectedAmount),
          register.countedAmount === null ? "" : num(register.countedAmount),
          register.difference === null ? "" : num(register.difference),
        ]),
      ],
    },
  ];
}

const REPORTS: Record<
  string,
  { label: string; build: (tenantId: string, period: Period) => Promise<Section[]> }
> = {
  vendas: { label: "vendas", build: salesReport },
  produtos: { label: "produtos", build: productsReport },
  caixa: { label: "caixa", build: cashReport },
};

export async function GET(request: Request) {
  const user = await requireUser();
  if (!canViewReports(user.role)) {
    return new Response("Sem permissão para exportar relatórios.", { status: 403 });
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("relatorio") ?? "vendas";
  const report = REPORTS[key];
  if (!report) {
    return new Response("Relatório desconhecido.", { status: 400 });
  }

  const period = resolvePeriod({
    de: url.searchParams.get("de") ?? undefined,
    ate: url.searchParams.get("ate") ?? undefined,
  });

  const sections = await report.build(user.tenantId, period);
  const csv = buildCsv([
    {
      title: `RELATORIO DE ${report.label.toUpperCase()} - ${formatISODate(period.from)} a ${formatISODate(period.to)}`,
      rows: [],
    },
    ...sections,
  ]);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="relatorio-${report.label}-${period.from}-a-${period.to}.csv"`,
    },
  });
}
