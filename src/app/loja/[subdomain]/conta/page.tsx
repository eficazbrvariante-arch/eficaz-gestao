import { listCustomerOrders } from "@/modules/orders/order-service";
import { getCustomerCreditBalance } from "@/modules/customers/customer-service";
import { listFiadoEntriesByCustomer, isFiadoOverdue } from "@/modules/fiado/fiado-service";
import { getCustomerConvenioBenefit } from "@/modules/convenios/convenio-customer-benefit";
import { listCustomerProtecaoEficaz } from "@/modules/protecao-eficaz/protecao-eficaz-service";
import {
  getCustomerCreditSummary,
  listCustomerApplications,
} from "@/modules/credito-eficaz/credito-eficaz-service";
import { formatBRL } from "@/lib/format";
import { LogoutButton } from "./logout-button";
import { requireCustomerAccountSession } from "./require-customer-account";
import { AccountFeatureCard, type AccountCardStatus } from "./account-feature-card";
import { CardIcon, ShieldLockIcon, BagIcon, WalletIcon, GiftIcon, UserIcon } from "../icons";

/** Pedidos ainda em curso (nem entregue/retirado, nem cancelado). */
const ORDER_IN_PROGRESS_STATUSES = new Set(["NEW", "CONFIRMED", "PREPARING", "SHIPPED"]);

export default async function CustomerAccountPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const { store, session, base } = await requireCustomerAccountSession(subdomain, `/loja/${subdomain}/conta`);

  const [
    orders,
    creditBalance,
    fiadoEntries,
    convenioBenefit,
    protecaoEficazRegistrations,
    creditoEficazSummary,
    creditoEficazApplications,
  ] = await Promise.all([
    listCustomerOrders(store.id, session.customerId),
    getCustomerCreditBalance(store.id, session.customerId),
    listFiadoEntriesByCustomer(store.id, session.customerId),
    getCustomerConvenioBenefit(session.customerId),
    listCustomerProtecaoEficaz(store.id, session.customerId),
    getCustomerCreditSummary(store.id, session.customerId),
    listCustomerApplications(store.id, session.customerId),
  ]);

  // --- Crédito Eficaz ---
  const latestApplication = creditoEficazApplications[0] ?? null;
  const hasApprovedCredit = !!creditoEficazSummary && creditoEficazSummary.limitAmount > 0;
  let creditoEficazStatus: AccountCardStatus | undefined;
  let creditoEficazValue: string | undefined;
  if (hasApprovedCredit && creditoEficazSummary) {
    creditoEficazStatus = creditoEficazSummary.blocked ? "BLOQUEADO" : "DISPONIVEL";
    creditoEficazValue = creditoEficazSummary.blocked
      ? "Bloqueado"
      : `${formatBRL(creditoEficazSummary.availableAmount)} disponível`;
  } else if (latestApplication?.status === "UNDER_REVIEW" || latestApplication?.status === "INFO_REQUESTED") {
    creditoEficazStatus = "EM_ANALISE";
  }

  // --- Proteção Eficaz ---
  const activeProtections = protecaoEficazRegistrations.filter(
    (r) => r.status === "APPROVED" && !r.redeemedAt
  );
  const pendingProtections = protecaoEficazRegistrations.filter((r) => r.status === "PENDING");
  let protecaoStatus: AccountCardStatus | undefined;
  let protecaoValue: string | undefined;
  if (activeProtections.length > 0) {
    protecaoStatus = "ATIVO";
    protecaoValue = `${activeProtections.length} ativa${activeProtections.length > 1 ? "s" : ""}`;
  } else if (pendingProtections.length > 0) {
    protecaoStatus = "EM_ANALISE";
  }

  // --- Minhas Compras ---
  const ordersInProgress = orders.filter((o) => ORDER_IN_PROGRESS_STATUSES.has(o.status)).length;
  const comprasBadge = orders.length > 0 ? `${orders.length}` : undefined;
  const comprasValue = ordersInProgress > 0 ? `${ordersInProgress} em andamento` : undefined;

  // --- Fiado e Crédito ---
  const pendingFiado = fiadoEntries.filter((entry) => entry.status === "PENDING");
  const overdueFiado = pendingFiado.filter(isFiadoOverdue);
  const totalPendingFiado = pendingFiado.reduce((sum, entry) => sum + Number(entry.amount), 0);
  let fiadoStatus: AccountCardStatus | undefined;
  let fiadoValue: string | undefined;
  if (overdueFiado.length > 0) {
    fiadoStatus = "ACAO_NECESSARIA";
    fiadoValue = `${formatBRL(totalPendingFiado)} vencido`;
  } else if (pendingFiado.length > 0) {
    fiadoStatus = "PENDENTE";
    fiadoValue = `${formatBRL(totalPendingFiado)} a pagar`;
  } else if (creditBalance > 0) {
    fiadoStatus = "DISPONIVEL";
    fiadoValue = `${formatBRL(creditBalance)} de crédito disponível`;
  }

  // --- Benefícios (Convênio) ---
  const showBenefits = !!convenioBenefit;
  const benefitsValue =
    convenioBenefit?.active && convenioBenefit.vitrine.length > 0
      ? `${convenioBenefit.vitrine.length} com desconto exclusivo`
      : undefined;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Minha conta</h1>
          <p className="text-sm text-slate-500">@{session.username}</p>
        </div>
        <LogoutButton subdomain={subdomain} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AccountFeatureCard
          icon={CardIcon}
          title="Crédito Eficaz"
          description={hasApprovedCredit ? "Seu crédito na Eficaz" : "Solicite seu limite"}
          href={`${base}/conta/credito-eficaz`}
          tone="credit"
          status={creditoEficazStatus}
          value={creditoEficazValue}
        />
        <AccountFeatureCard
          icon={ShieldLockIcon}
          title="Proteção Eficaz"
          description="Proteja sua compra"
          href={`${base}/conta/protecao-eficaz`}
          tone="protection"
          status={protecaoStatus}
          value={protecaoValue}
        />
        <AccountFeatureCard
          icon={BagIcon}
          title="Minhas Compras"
          description="Pedidos e histórico"
          href={`${base}/conta/compras`}
          tone="purchases"
          badge={comprasBadge}
          value={comprasValue}
        />
        <AccountFeatureCard
          icon={WalletIcon}
          title="Fiado e Crédito"
          description="Consulte seu saldo"
          href={`${base}/conta/fiado`}
          tone="fiado"
          status={fiadoStatus}
          value={fiadoValue}
        />
        {showBenefits && (
          <AccountFeatureCard
            icon={GiftIcon}
            title="Benefícios"
            description={convenioBenefit?.convenioName ?? "Suas vantagens"}
            href={`${base}/conta/beneficios`}
            tone="benefits"
            status={convenioBenefit?.active ? undefined : "BLOQUEADO"}
            value={benefitsValue}
          />
        )}
        <AccountFeatureCard
          icon={UserIcon}
          title="Meus Dados"
          description="Cadastro e segurança"
          href={`${base}/conta/dados`}
          tone="neutral"
        />
      </div>
    </div>
  );
}
