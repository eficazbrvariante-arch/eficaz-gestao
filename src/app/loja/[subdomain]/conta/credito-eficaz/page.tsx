import Link from "next/link";
import { requireCustomerAccountSession } from "../require-customer-account";
import { CreditoEficazSection } from "../credito-eficaz-section";
import { PactoDeConfianca, type PactoVariant } from "./pacto-de-confianca";
import {
  getCustomerCreditSummary,
  listCustomerApplications,
} from "@/modules/credito-eficaz/credito-eficaz-service";

const REQUEST_ANCHOR_ID = "credito-eficaz-solicitar";

export default async function CreditoEficazAccountPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const { store, session, base } = await requireCustomerAccountSession(
    subdomain,
    `/loja/${subdomain}/conta/credito-eficaz`
  );

  const [summary, applications] = await Promise.all([
    getCustomerCreditSummary(store.id, session.customerId),
    listCustomerApplications(store.id, session.customerId),
  ]);
  const latestApplication = applications[0] ?? null;
  const hasApprovedCredit = !!summary && summary.limitAmount > 0;

  // Mesmo cálculo de estado usado em `CreditoEficazSection` — só decide a
  // versão (completa/reduzida) do Pacto de Confiança, nunca uma regra nova.
  const variant: PactoVariant = summary?.blocked
    ? "bloqueado"
    : hasApprovedCredit
      ? "aprovado"
      : latestApplication?.status === "UNDER_REVIEW"
        ? "em_analise"
        : "novo";

  return (
    <div>
      <Link
        href={`${base}/conta`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 hover:underline"
      >
        ← Voltar para Minha Conta
      </Link>

      <PactoDeConfianca variant={variant} requestAnchorId={REQUEST_ANCHOR_ID} />

      <div id={REQUEST_ANCHOR_ID}>
        <CreditoEficazSection subdomain={subdomain} summary={summary} latestApplication={latestApplication} />
      </div>
    </div>
  );
}
