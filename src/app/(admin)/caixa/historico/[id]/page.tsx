import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canFinalizeCashRegisterReview, canManageCashRegister, canViewReports } from "@/lib/permissions";
import { formatBRL, formatDateTime } from "@/lib/format";
import { FinalizeReviewForm } from "../../cash-forms";

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

          <p className="mb-2 text-xs text-text-muted">
            Débito, crédito e Pix não passam pela gaveta — compare o valor esperado abaixo contra os
            comprovantes da maquininha.
          </p>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-900">Débito esperado</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {formatBRL(register.expectedDebitAmount ?? 0)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-900">Crédito esperado</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {formatBRL(register.expectedCreditAmount ?? 0)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-900">Pix esperado</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {formatBRL(register.expectedPixAmount ?? 0)}
              </p>
            </div>
          </div>
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
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Finalizar fechamento</h2>
          <p className="mb-4 text-sm text-slate-900">
            Confira a contagem e as fotos acima. Ao finalizar, o caixa fica marcado como fechado.
          </p>
          <FinalizeReviewForm registerId={register.id} />
        </div>
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
