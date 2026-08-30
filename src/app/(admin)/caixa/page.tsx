import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatBRL, formatDateTime } from "@/lib/format";
import { canCloseCashRegisterDirectly, canMoveCash, canViewReports } from "@/lib/permissions";
import { getCashSummary, getOpenCashRegister } from "@/modules/cash/cash-service";
import { OpenCashForm, CloseCashForm, SubmitCashForReviewForm, CashMovementForm } from "./cash-forms";

const MOVEMENT_LABELS = {
  WITHDRAWAL: "Sangria",
  SUPPLY: "Suprimento",
} as const;

export default async function CaixaPage() {
  const user = await requireUser();
  const register = await getOpenCashRegister(user.tenantId);

  if (!register) {
    const [lastClosed, pendingReview] = await Promise.all([
      prisma.cashRegister.findFirst({
        where: { tenantId: user.tenantId, status: "CLOSED" },
        include: { closedBy: { select: { name: true } } },
        orderBy: { closedAt: "desc" },
      }),
      prisma.cashRegister.findMany({
        where: { tenantId: user.tenantId, status: "PENDING_REVIEW" },
        include: { reviewSubmittedBy: { select: { name: true } } },
        orderBy: { reviewSubmittedAt: "desc" },
      }),
    ]);

    return (
      <div>
        <h1 className="mb-1 text-xl font-semibold text-foreground">Caixa</h1>
        <p className="mb-6 text-sm text-text-muted">
          Nenhum caixa aberto. Abra o caixa para começar a vender no PDV.
        </p>

        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Abrir caixa</h2>
          <OpenCashForm />
        </div>

        {pendingReview.length > 0 && (
          <div className="mt-6 max-w-md rounded-xl border border-warning/30 bg-warning/10 p-5 text-sm">
            <p className="mb-2 font-semibold text-warning">
              {pendingReview.length === 1
                ? "1 caixa aguardando revisão do Administrador"
                : `${pendingReview.length} caixas aguardando revisão do Administrador`}
            </p>
            <div className="space-y-1 text-text-muted">
              {pendingReview.map((r) => (
                <div key={r.id} className="flex justify-between">
                  <span>{r.reviewSubmittedBy?.name ?? "-"}</span>
                  <span>{r.reviewSubmittedAt ? formatDateTime(r.reviewSubmittedAt) : "-"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {lastClosed && (
          <div className="mt-6 max-w-md rounded-xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
            <p className="mb-2 font-semibold text-slate-900">Último fechamento</p>
            <div className="space-y-1 text-slate-600">
              <div className="flex justify-between">
                <span>Fechado em</span>
                <span>{lastClosed.closedAt ? formatDateTime(lastClosed.closedAt) : "-"}</span>
              </div>
              <div className="flex justify-between">
                <span>Por</span>
                <span>{lastClosed.closedBy?.name ?? "-"}</span>
              </div>
              <div className="flex justify-between">
                <span>Valor contado</span>
                <span>{formatBRL(lastClosed.countedAmount ?? 0)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6">
          <Link href="/caixa/historico" className="text-sm text-text-muted hover:underline">
            Ver histórico de caixas →
          </Link>
        </div>
      </div>
    );
  }

  const [summary, movements] = await Promise.all([
    getCashSummary(user.tenantId, register.id),
    prisma.cashMovement.findMany({
      where: { cashRegisterId: register.id },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Dinheiro/Pix/débito/crédito somam venda do PDV + recebimento de
  // Assistência Técnica (ver `totalCash`/`totalPix`/`totalDebit`/`totalCredit`
  // em `getCashSummary`) — não é só "vendas", por isso os rótulos genéricos.
  const stats = [
    { label: "Abertura", value: formatBRL(summary.openingAmount) },
    { label: "Dinheiro", value: formatBRL(summary.totalCash) },
    { label: "Débito", value: formatBRL(summary.totalDebit) },
    { label: "Crédito", value: formatBRL(summary.totalCredit) },
    { label: "Pix", value: formatBRL(summary.totalPix) },
    { label: "Esperado na gaveta", value: formatBRL(summary.expectedInDrawer) },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Caixa aberto</h1>
          <p className="text-sm text-text-muted">
            Aberto por {register.openedBy.name} em {formatDateTime(register.openedAt)} ·{" "}
            {summary.salesCount} venda(s)
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/caixa/historico"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Histórico
          </Link>
          <Link
            href="/pdv"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Ir para o PDV
          </Link>
        </div>
      </div>

      {/* Só Admin/Gerente vê o total geral — Vendedor fecha conferindo forma
          por forma, sem ver o faturamento consolidado do dia (ver `canViewReports`). */}
      {canViewReports(user.role) && (
        <div className="mb-6 rounded-xl border border-brand bg-brand p-5 shadow-sm">
          <p className="text-sm text-brand-contrast/80">
            Total do caixa <span className="text-brand-contrast/60">(todas as formas de pagamento)</span>
          </p>
          <p className="mt-1 text-3xl font-bold text-brand-contrast">{formatBRL(summary.grandTotal)}</p>
        </div>
      )}

      {/* Vendedor fecha o caixa às cegas (só digita o dinheiro contado, sem
          ver o que o sistema espera em nenhuma forma de pagamento) — por
          isso esse quadro some pra ele, não só o total geral acima. */}
      {canViewReports(user.role) && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm text-slate-900">{stat.label}</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {canMoveCash(user.role) && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Sangria / Suprimento</h2>
            <CashMovementForm />
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {canCloseCashRegisterDirectly(user.role) ? (
            <>
              <h2 className="mb-4 text-sm font-semibold text-slate-900">Fechar caixa</h2>
              <CloseCashForm
                expectedInDrawer={summary.expectedInDrawer}
                expectedDebit={summary.totalDebit}
                expectedCredit={summary.totalCredit}
                expectedPix={summary.totalPix}
              />
            </>
          ) : (
            <>
              <h2 className="mb-1 text-sm font-semibold text-slate-900">Fechar caixa</h2>
              <p className="mb-4 text-sm text-slate-900">
                Conte o dinheiro na gaveta e anexe a foto do comprovante da maquininha. O
                Administrador confere e finaliza o fechamento depois.
              </p>
              <SubmitCashForReviewForm />
            </>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
            Movimentações do caixa
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{MOVEMENT_LABELS[m.type]}</div>
                      <div className="text-xs text-slate-400">
                        {m.description} · {m.user.name}
                      </div>
                      <div className="text-xs text-slate-400">{formatDateTime(m.createdAt)}</div>
                      {m.receiptPhotoUrl && (
                        <a
                          href={m.receiptPhotoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-xs font-medium text-slate-600 underline hover:text-slate-900"
                        >
                          Ver foto do comprovante
                        </a>
                      )}
                    </td>
                    <td
                      className={
                        m.type === "WITHDRAWAL"
                          ? "px-4 py-3 text-right font-medium text-red-600"
                          : "px-4 py-3 text-right font-medium text-emerald-700"
                      }
                    >
                      {m.type === "WITHDRAWAL" ? "-" : "+"}
                      {formatBRL(m.amount)}
                    </td>
                  </tr>
                ))}
                {movements.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-400">
                      Nenhuma sangria ou suprimento neste caixa.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
