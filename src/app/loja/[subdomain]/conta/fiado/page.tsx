import { requireCustomerAccountSession } from "../require-customer-account";
import { AccountDetailHeader } from "../account-detail-header";
import { getCustomerCreditBalance } from "@/modules/customers/customer-service";
import { listFiadoEntriesByCustomer, isFiadoOverdue } from "@/modules/fiado/fiado-service";
import { formatBRL, formatDate } from "@/lib/format";
import { WalletIcon } from "../../icons";

export default async function FiadoAccountPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const { store, session, base } = await requireCustomerAccountSession(
    subdomain,
    `/loja/${subdomain}/conta/fiado`
  );

  const [creditBalance, fiadoEntries] = await Promise.all([
    getCustomerCreditBalance(store.id, session.customerId),
    listFiadoEntriesByCustomer(store.id, session.customerId),
  ]);
  const pendingFiado = fiadoEntries.filter((entry) => entry.status === "PENDING");

  return (
    <div>
      <AccountDetailHeader
        icon={WalletIcon}
        title="Fiado e Crédito"
        description="Consulte seu saldo disponível"
        tone="fiado"
        base={base}
      />
      <p className="mb-6 text-sm text-slate-500">
        Crédito de loja (gerado por trocas/cancelamentos) e fiado (venda a prazo) — dois saldos
        separados do Crédito Eficaz.
      </p>

      {creditBalance <= 0 && pendingFiado.length === 0 ? (
        <p className="text-sm text-slate-500">
          Você não tem fiado pendente nem crédito de loja disponível no momento.
        </p>
      ) : (
        <div className="rounded-xl border border-slate-200 p-4">
          {creditBalance > 0 && (
            <p className="mb-3 text-sm font-medium text-emerald-700">
              Você tem {formatBRL(creditBalance)} em crédito de loja disponível.
            </p>
          )}

          {pendingFiado.length > 0 && (
            <ul className="space-y-2 text-sm">
              {pendingFiado.map((entry) => {
                const overdue = isFiadoOverdue(entry);
                return (
                  <li key={entry.id} className="flex justify-between gap-2">
                    <span className={overdue ? "font-medium text-red-600" : "text-slate-700"}>
                      {overdue ? "Vencido" : "A pagar"}
                      {entry.dueDate ? ` até ${formatDate(entry.dueDate)}` : ""}
                    </span>
                    <span className="shrink-0 font-medium text-slate-900">
                      {formatBRL(Number(entry.amount))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
