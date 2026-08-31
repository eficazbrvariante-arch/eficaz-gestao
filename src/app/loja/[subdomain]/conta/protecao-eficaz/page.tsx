import { requireCustomerAccountSession } from "../require-customer-account";
import { BackToAccountLink } from "../back-to-account-link";
import { ProtecaoEficazSection } from "../protecao-eficaz-form";
import { listCustomerProtecaoEficaz } from "@/modules/protecao-eficaz/protecao-eficaz-service";

export default async function ProtecaoEficazAccountPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const { store, session, base } = await requireCustomerAccountSession(
    subdomain,
    `/loja/${subdomain}/conta/protecao-eficaz`
  );

  const registrations = await listCustomerProtecaoEficaz(store.id, session.customerId);

  return (
    <div>
      <BackToAccountLink base={base} />
      <ProtecaoEficazSection subdomain={subdomain} registrations={registrations} />
    </div>
  );
}
