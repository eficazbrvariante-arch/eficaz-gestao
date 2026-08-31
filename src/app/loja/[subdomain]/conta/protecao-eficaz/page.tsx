import { requireCustomerAccountSession } from "../require-customer-account";
import { AccountDetailHeader } from "../account-detail-header";
import { ProtecaoEficazSection } from "../protecao-eficaz-form";
import { listCustomerProtecaoEficaz } from "@/modules/protecao-eficaz/protecao-eficaz-service";
import { ShieldLockIcon } from "../../icons";

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
      <AccountDetailHeader
        icon={ShieldLockIcon}
        title="Proteção Eficaz"
        description="Proteja suas compras com tranquilidade"
        tone="protection"
        base={base}
      />
      <ProtecaoEficazSection subdomain={subdomain} registrations={registrations} />
    </div>
  );
}
