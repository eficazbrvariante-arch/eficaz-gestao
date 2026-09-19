import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  canEditClosedCashRegister,
  canFinalizeCashRegisterReview,
  canManageCashRegister,
  canViewReports,
} from "@/lib/permissions";
import { formatBRL, formatDateTime, type DecimalLike } from "@/lib/format";
import { FinalizeReviewForm, ClosedRegisterPanel, type ClosedRegisterEntry } from "../../cash-forms";
import { CashDiagnosisCard } from "@/components/cash-diagnosis-card";
import type { CashDifferenceEntry } from "@/lib/cash-diagnosis";
import { getCashSummary, type CashSummary } from "@/modules/cash/cash-service";

/**
 * De onde sai o "Dinheiro esperado": valor contado na abertura + entradas em
 * dinheiro - sangrias. Recalculado agora a partir das vendas/movimentações —
 * se não bater com o esperado gravado no fechamento (ex.: venda cancelada
 * depois), avisa em vez de esconder a divergência.
 */
function ExpectedCashBreakdown({
  summary,
  storedExpected,
}: {
  summary: CashSummary;
  storedExpected: DecimalLike | null;
}) {
  const rows: { label: string; value: number; sign: "+" | "-" | "" }[] = [
    { label: "Contado na abertura", value: summary.openingAmount, sign: "" },
    { label: "Vendas em dinheiro", value: summary.cashSales, sign: "+" },
    { label: "Assistência técnica em dinheiro", value: summary.repairCashReceipts, sign: "+" },
    { label: "Fiado recebido em dinheiro", value: summary.fiadoCashReceipts, sign: "+" },
    { label: "Suprimentos", value: summary.supplies, sign: "+" },
    { label: "Sangrias", value: summary.withdrawals, sign: "-" },
  ];
  const differsFromStored =
    storedExpected !== null && Math.abs(Number(storedExpected) - summary.expectedInDrawer) >= 0.005;
  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Como chegamos no dinheiro esperado</h2>
      <dl className="mt-3 max-w-md space-y-1 text-sm">
        {rows.map((r, i) => (
          <div key={r.label} className={"flex justify-between" + (i === 0 ? " font-semibold" : "")}>
            <dt className="text-slate-600">{r.label}</dt>
            <dd className={r.sign === "-" && r.value > 0 ? "text-red-600" : "text-slate-900"}>
              {r.sign && r.value > 0 ? `${r.sign} ` : ""}
              {formatBRL(r.value)}
            </dd>
          </div>
        ))}
        <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold">
          <dt className="text-slate-900">Dinheiro esperado</dt>
          <dd className="text-slate-900">{formatBRL(summary.expectedInDrawer)}</dd>
        </div>
      </dl>
      {differsFromStored && storedExpected !== null && (
        <p className="mt-3 text-xs text-amber-700">
          No fechamento o sistema gravou {formatBRL(storedExpected)} como esperado — as vendas ou
          movimentações deste caixa mudaram depois disso (ex.: venda cancelada).
        </p>
      )}
    </div>
  );
}

/** Cartão estático (fechamento já finalizado, ou sem permissão de finalizar) de uma forma que não passa pela gaveta: esperado, o que veio de fato e a diferença. */
function ExpectedCountedCard({
  label,
  expected,
  counted,
}: {
  label: string;
  expected: DecimalLike | null;
  counted: DecimalLike | null;
}) {
  const difference = expected !== null && counted !== null ? Number(counted) - Number(expected) : null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-900">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-900">
        {expected !== null ? formatBRL(expected) : "-"}
      </p>
      <div className="mt-3 flex justify-between border-t border-slate-100 pt-2 text-sm">
        <span className="text-slate-600">Veio de fato</span>
        <span className="font-medium text-slate-900">{counted !== null ? formatBRL(counted) : "-"}</span>
      </div>
      <div className="mt-1 flex justify-between text-sm font-medium">
        <span className="text-slate-600">Diferença</span>
        <span
          className={
            difference === null
              ? "text-slate-900"
              : Math.abs(difference) < 0.005
                ? "text-slate-900"
                : difference > 0
                  ? "text-emerald-700"
                  : "text-red-600"
          }
        >
          {difference === null ? "-" : `${difference > 0 ? "+" : ""}${formatBRL(difference)}`}
        </span>
      </div>
    </div>
  );
}

export default async function CaixaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!canManageCashRegister(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar o histórico de caixa.
      </div>
    );
  }

  const register = await prisma.cashRegister.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      openedBy: { select: { name: true } },
      reviewSubmittedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
    },
  });
  if (!register) notFound();

  const cashDifference =
    register.countedAmount !== null && register.expectedAmount !== null
      ? Number(register.countedAmount) - Number(register.expectedAmount)
      : null;
  const debitDifference =
    register.countedDebitAmount !== null && register.expectedDebitAmount !== null
      ? Number(register.countedDebitAmount) - Number(register.expectedDebitAmount)
      : null;
  const creditDifference =
    register.countedCreditAmount !== null && register.expectedCreditAmount !== null
      ? Number(register.countedCreditAmount) - Number(register.expectedCreditAmount)
      : null;
  const pixDifference =
    register.countedPixAmount !== null && register.expectedPixAmount !== null
      ? Number(register.countedPixAmount) - Number(register.expectedPixAmount)
      : null;

  const diagnosisEntries: CashDifferenceEntry[] = [
    { label: "Dinheiro", difference: cashDifference },
    { label: "Débito", difference: debitDifference },
    { label: "Crédito", difference: creditDifference },
    { label: "Pix", difference: pixDifference },
  ].filter((e): e is CashDifferenceEntry => e.difference !== null);

  const canSeeAmounts = canViewReports(user.role);
  const cashSummary = canSeeAmounts ? await getCashSummary(user.tenantId, register.id) : null;
  const canFinalize = canFinalizeCashRegisterReview(user.role) && register.status === "PENDING_REVIEW";

  const closedEntries: ClosedRegisterEntry[] | null =
    register.status === "CLOSED"
      ? [
          {
            key: "countedAmount",
            label: "Dinheiro",
            expected: Number(register.expectedAmount ?? 0),
            counted: Number(register.countedAmount ?? 0),
          },
          {
            key: "countedDebitAmount",
            label: "Débito",
            expected: Number(register.expectedDebitAmount ?? 0),
            counted: Number(register.countedDebitAmount ?? 0),
          },
          {
            key: "countedCreditAmount",
            label: "Crédito",
            expected: Number(register.expectedCreditAmount ?? 0),
            counted: Number(register.countedCreditAmount ?? 0),
          },
          {
            key: "countedPixAmount",
            label: "Pix",
            expected: Number(register.expectedPixAmount ?? 0),
            counted: Number(register.countedPixAmount ?? 0),
          },
        ]
      : null;

  return (
    <div>
      <div className="mb-6">
        <Link href="/caixa/historico" className="text-sm text-text-muted hover:underline">
          ← Voltar para o histórico
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-foreground">
          Caixa aberto em {formatDateTime(register.openedAt)}
        </h1>
        <p className="text-sm text-text-muted">
          Aberto por {register.openedBy.name}
          {register.reviewSubmittedBy && register.reviewSubmittedAt && (
            <>
              {" "}
              · contagem enviada por {register.reviewSubmittedBy.name} em{" "}
              {formatDateTime(register.reviewSubmittedAt)}
            </>
          )}
          {canSeeAmounts && <> · contado na abertura: {formatBRL(register.openingAmount)}</>}
        </p>
      </div>

      {canSeeAmounts && closedEntries && (
        <ClosedRegisterPanel
          registerId={register.id}
          entries={closedEntries}
          notes={register.notes}
          canEdit={canEditClosedCashRegister(user.role)}
        />
      )}

      {canSeeAmounts && !closedEntries && (
        <>
          {/* Mesmo formato de card da tela de fechamento no PDV/loja — pra
              o Admin conferir forma por forma, "teve mais, teve menos",
              sem precisar recalcular nada na cabeça. */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-900">Dinheiro esperado</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {register.expectedAmount !== null ? formatBRL(register.expectedAmount) : "-"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-900">Dinheiro contado (às cegas)</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {register.countedAmount !== null ? formatBRL(register.countedAmount) : "-"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-900">Diferença (dinheiro)</p>
              <p
                className={
                  "mt-2 text-xl font-semibold " +
                  (cashDifference === null
                    ? "text-slate-900"
                    : Math.abs(cashDifference) < 0.005
                      ? "text-slate-900"
                      : cashDifference > 0
                        ? "text-emerald-700"
                        : "text-red-600")
                }
              >
                {cashDifference === null
                  ? "-"
                  : `${cashDifference > 0 ? "+" : ""}${formatBRL(cashDifference)}`}
              </p>
            </div>
          </div>

          {/* Quando ainda dá pra finalizar, o próprio formulário abaixo já
              mostra esperado + campo pra digitar + diferença, tudo no mesmo
              cartão — evita duplicar esses três cartões aqui em cima. */}
          {!canFinalize && (
            <>
              <p className="mb-2 text-xs text-text-muted">
                Débito, crédito e Pix não passam pela gaveta — comparado contra os comprovantes da
                maquininha no fechamento.
              </p>
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <ExpectedCountedCard
                  label="Débito esperado"
                  expected={register.expectedDebitAmount}
                  counted={register.countedDebitAmount}
                />
                <ExpectedCountedCard
                  label="Crédito esperado"
                  expected={register.expectedCreditAmount}
                  counted={register.countedCreditAmount}
                />
                <ExpectedCountedCard
                  label="Pix esperado"
                  expected={register.expectedPixAmount}
                  counted={register.countedPixAmount}
                />
              </div>
              <CashDiagnosisCard entries={diagnosisEntries} />
            </>
          )}
        </>
      )}

      {cashSummary && (
        <ExpectedCashBreakdown summary={cashSummary} storedExpected={register.expectedAmount} />
      )}

      <div className="mb-6">
        <Link href={`/vendas?cashRegisterId=${register.id}`} className="text-sm text-brand hover:underline">
          Ver vendas deste caixa →
        </Link>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">
          Comprovantes da maquininha ({register.receiptPhotoUrls.length})
        </h2>
        {register.receiptPhotoUrls.length === 0 ? (
          <p className="text-sm text-slate-900">Nenhuma foto anexada.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {register.receiptPhotoUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- domínio da imagem não é conhecido em build time */}
                <img
                  src={url}
                  alt="Comprovante da maquininha"
                  className="h-40 w-full rounded-md border border-slate-200 object-cover"
                />
              </a>
            ))}
          </div>
        )}
        {register.notes && (
          <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-900">
            <span className="font-medium">Observações:</span> {register.notes}
          </p>
        )}
      </div>

      {canFinalize && (
        <FinalizeReviewForm
          registerId={register.id}
          expectedDebit={Number(register.expectedDebitAmount ?? 0)}
          expectedCredit={Number(register.expectedCreditAmount ?? 0)}
          expectedPix={Number(register.expectedPixAmount ?? 0)}
        />
      )}

      {register.status === "CLOSED" && (
        <p className="text-sm text-text-muted">
          Fechado por {register.closedBy?.name ?? "-"} em{" "}
          {register.closedAt ? formatDateTime(register.closedAt) : "-"}.
        </p>
      )}
    </div>
  );
}
