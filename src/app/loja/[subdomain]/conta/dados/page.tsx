import { requireCustomerAccountSession } from "../require-customer-account";
import { BackToAccountLink } from "../back-to-account-link";
import { ChangePasswordForm } from "../change-password-form";
import { getCustomerProfile } from "@/modules/customers/customer-service";

export default async function DadosAccountPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const { store, session, base } = await requireCustomerAccountSession(
    subdomain,
    `/loja/${subdomain}/conta/dados`
  );

  const profile = await getCustomerProfile(store.id, session.customerId);

  return (
    <div>
      <BackToAccountLink base={base} />
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Meus Dados</h1>

      {profile && (
        <div className="mb-8 space-y-3 rounded-xl border border-slate-200 p-4 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">Nome</span>
            <span className="font-medium text-slate-900">{profile.name}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">Usuário</span>
            <span className="font-medium text-slate-900">@{profile.username}</span>
          </div>
          {profile.document && (
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">CPF/CNPJ</span>
              <span className="font-medium text-slate-900">{profile.document}</span>
            </div>
          )}
          {profile.phone && (
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">Telefone</span>
              <span className="font-medium text-slate-900">{profile.phone}</span>
            </div>
          )}
          {profile.email && (
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">E-mail</span>
              <span className="font-medium text-slate-900">{profile.email}</span>
            </div>
          )}
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold text-slate-900">Alterar senha</h2>
      <ChangePasswordForm subdomain={subdomain} />
    </div>
  );
}
