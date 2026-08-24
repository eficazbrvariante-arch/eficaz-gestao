import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canFinalizeCashRegisterReview, canManageCashRegister, canViewReports } from "@/lib/permissions";
import { formatBRL, formatDateTime, type DecimalLike } from "@/lib/format";
import { FinalizeReviewForm } from "../../cash-forms";

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

  const canSeeAmounts = canViewReports(user.role);
  const canFinalize = canFinalizeCashRegisterReview(user.role) && register.status === "PENDING_REVIEW";

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
          {register.reviewSubmittedBy && (
            <> · contagem enviada por {register.reviewSubmittedBy.name}</>
          )}
        </p>
      </div>

      {canSeeAmounts && (
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
            </>
          )}
        </>
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
