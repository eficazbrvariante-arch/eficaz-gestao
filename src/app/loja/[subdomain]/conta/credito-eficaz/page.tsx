import { requireCustomerAccountSession } from "../require-customer-account";
import { BackToAccountLink } from "../back-to-account-link";
import { CreditoEficazSection } from "../credito-eficaz-section";
import {
  getCustomerCreditSummary,
  listCustomerApplications,
} from "@/modules/credito-eficaz/credito-eficaz-service";

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

  return (
    <div>
      <BackToAccountLink base={base} />
      <CreditoEficazSection subdomain={subdomain} summary={summary} latestApplication={applications[0] ?? null} />
    </div>
  );
}
