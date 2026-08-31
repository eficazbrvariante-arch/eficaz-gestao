import { listCustomerOrders } from "@/modules/orders/order-service";
import { getCustomerCreditBalance, getCustomerProfile } from "@/modules/customers/customer-service";
import { listFiadoEntriesByCustomer, isFiadoOverdue } from "@/modules/fiado/fiado-service";
import { getCustomerConvenioBenefit } from "@/modules/convenios/convenio-customer-benefit";
import { listCustomerProtecaoEficaz } from "@/modules/protecao-eficaz/protecao-eficaz-service";
import { storeCityLabel } from "@/modules/catalog/tenant-resolver";
import {
  getCustomerCreditSummary,
  listCustomerApplications,
} from "@/modules/credito-eficaz/credito-eficaz-service";
import { formatBRL } from "@/lib/format";
import { LogoutButton } from "./logout-button";
import { requireCustomerAccountSession } from "./require-customer-account";
import { AccountFeatureCard, type AccountCardStatus } from "./account-feature-card";
import { AccountTrustStrip, buildTrustItems } from "./account-trust-strip";
import { AccountProgressStrip, type ProgressStat } from "./account-progress-strip";
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
    profile,
  ] = await Promise.all([
    listCustomerOrders(store.id, session.customerId),
    getCustomerCreditBalance(store.id, session.customerId),
    listFiadoEntriesByCustomer(store.id, session.customerId),
    getCustomerConvenioBenefit(session.customerId),
    listCustomerProtecaoEficaz(store.id, session.customerId),
    getCustomerCreditSummary(store.id, session.customerId),
    listCustomerApplications(store.id, session.customerId),
    getCustomerProfile(store.id, session.customerId),
  ]);

  // --- Crédito Eficaz ---
  const latestApplication = creditoEficazApplications[0] ?? null;
  const hasApprovedCredit = !!creditoEficazSummary && creditoEficazSummary.limitAmount > 0;
  let creditoEficazStatus: AccountCardStatus | undefined;
  let creditoEficazPill: string | undefined;
  if (hasApprovedCredit && creditoEficazSummary) {
    creditoEficazStatus = creditoEficazSummary.blocked ? "BLOQUEADO" : "DISPONIVEL";
    creditoEficazPill = creditoEficazSummary.blocked
      ? "Bloqueado"
      : `${formatBRL(creditoEficazSummary.availableAmount)} disponível`;
  } else if (latestApplication?.status === "UNDER_REVIEW" || latestApplication?.status === "INFO_REQUESTED") {
    creditoEficazStatus = "EM_ANALISE";
    creditoEficazPill = "Em análise";
  } else {
    creditoEficazPill = "Solicitar crédito";
  }

  // --- Proteção Eficaz ---
  const activeProtections = protecaoEficazRegistrations.filter(
    (r) => r.status === "APPROVED" && !r.redeemedAt
  );
  const pendingProtections = protecaoEficazRegistrations.filter((r) => r.status === "PENDING");
  let protecaoStatus: AccountCardStatus | undefined;
  let protecaoPill: string | undefined;
  if (activeProtections.length > 0) {
    protecaoStatus = "ATIVO";
    protecaoPill = `${activeProtections.length} ativa${activeProtections.length > 1 ? "s" : ""}`;
  } else if (pendingProtections.length > 0) {
    protecaoStatus = "EM_ANALISE";
    protecaoPill = "Em análise";
  }

  // --- Minhas Compras ---
  const ordersInProgress = orders.filter((o) => ORDER_IN_PROGRESS_STATUSES.has(o.status)).length;
  const comprasPill =
    orders.length > 0
      ? ordersInProgress > 0
        ? `${ordersInProgress} em andamento`
        : `${orders.length} pedido${orders.length > 1 ? "s" : ""}`
      : undefined;

  // --- Fiado e Crédito ---
  const pendingFiado = fiadoEntries.filter((entry) => entry.status === "PENDING");
  const overdueFiado = pendingFiado.filter(isFiadoOverdue);
  const totalPendingFiado = pendingFiado.reduce((sum, entry) => sum + Number(entry.amount), 0);
  let fiadoStatus: AccountCardStatus | undefined;
  let fiadoPill: string | undefined;
  if (overdueFiado.length > 0) {
    fiadoStatus = "ACAO_NECESSARIA";
    fiadoPill = `${formatBRL(totalPendingFiado)} vencido`;
  } else if (pendingFiado.length > 0) {
    fiadoStatus = "PENDENTE";
    fiadoPill = `${formatBRL(totalPendingFiado)} a pagar`;
  } else if (creditBalance > 0) {
    fiadoStatus = "DISPONIVEL";
    fiadoPill = `${formatBRL(creditBalance)} disponível`;
  }

  // --- Benefícios (Convênio) ---
  const showBenefits = !!convenioBenefit;
  const benefitsCount = convenioBenefit?.active ? convenioBenefit.vitrine.length : 0;
  const benefitsStatus: AccountCardStatus | undefined = convenioBenefit && !convenioBenefit.active ? "BLOQUEADO" : undefined;
  const benefitsPill = !convenioBenefit
    ? undefined
    : !convenioBenefit.active
      ? "Inativo"
      : benefitsCount > 0
        ? `${benefitsCount} disponível${benefitsCount > 1 ? "is" : ""}`
        : "Ativo";

  // --- Meus Dados ---
  const cadastroCompleto = !!(profile?.document && profile?.phone && profile?.email);

  // --- Selos de confiança (dados reais da própria loja) ---
  const trustItems = buildTrustItems({
    deliveryEnabled: store.deliveryEnabled,
    pickupEnabled: store.pickupEnabled,
    whatsapp: store.whatsapp,
    cityLabel: storeCityLabel(store),
  });

  // --- Resumo real (nunca XP/nível/ranking fictício) ---
  const progressStats: ProgressStat[] = [];
  if (orders.length > 0) {
    progressStats.push({ key: "orders", icon: BagIcon, value: String(orders.length), label: "Pedidos" });
  }
  if (hasApprovedCredit && creditoEficazSummary && !creditoEficazSummary.blocked) {
    progressStats.push({
      key: "credit",
      icon: CardIcon,
      value: formatBRL(creditoEficazSummary.availableAmount),
      label: "Crédito disponível",
    });
  }
  if (activeProtections.length > 0) {
    progressStats.push({
      key: "protection",
      icon: ShieldLockIcon,
      value: String(activeProtections.length),
      label: "Proteções ativas",
    });
  }
  if (showBenefits && benefitsCount > 0) {
    progressStats.push({ key: "benefits", icon: GiftIcon, value: String(benefitsCount), label: "Benefícios" });
  }
  if (cadastroCompleto) {
    progressStats.push({ key: "profile", icon: UserIcon, value: "Completo", label: "Cadastro" });
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Bem-vindo, <span className="text-emerald-600">@{session.username}</span>
          </h1>
          <p className="text-sm text-slate-500">Gerencie seus benefícios, créditos e compras.</p>
        </div>
        <LogoutButton subdomain={subdomain} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AccountFeatureCard
          icon={ShieldLockIcon}
          title="Proteção Eficaz"
          description="Proteja suas compras com tranquilidade"
          href={`${base}/conta/protecao-eficaz`}
          tone="protection"
          status={protecaoStatus}
          pill={protecaoPill}
        />
        <AccountFeatureCard
          icon={CardIcon}
          title="Crédito Eficaz"
          description="Seu limite exclusivo na Eficaz"
          href={`${base}/conta/credito-eficaz`}
          tone="credit"
          status={creditoEficazStatus}
          pill={creditoEficazPill}
        />
        <AccountFeatureCard
          icon={WalletIcon}
          title="Fiado e Crédito"
          description="Consulte seu saldo disponível"
          href={`${base}/conta/fiado`}
          tone="fiado"
          status={fiadoStatus}
          pill={fiadoPill}
        />
        <AccountFeatureCard
          icon={BagIcon}
          title="Minhas Compras"
          description="Acompanhe seus pedidos e histórico"
          href={`${base}/conta/compras`}
          tone="purchases"
          pill={comprasPill}
        />
        {showBenefits && (
          <AccountFeatureCard
            icon={GiftIcon}
            title="Meus Benefícios"
            description="Confira suas vantagens e recompensas"
            href={`${base}/conta/beneficios`}
            tone="benefits"
            status={benefitsStatus}
            pill={benefitsPill}
          />
        )}
        <AccountFeatureCard
          icon={UserIcon}
          title="Meus Dados"
          description="Atualize seus dados e segurança"
          href={`${base}/conta/dados`}
          tone="neutral"
          pill={cadastroCompleto ? "Cadastro completo" : undefined}
        />
      </div>

      <AccountTrustStrip items={trustItems} />
      <AccountProgressStrip stats={progressStats} />
    </div>
  );
}
