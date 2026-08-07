import { notFound, redirect } from "next/navigation";
import { getStoreBySubdomain } from "@/modules/catalog/tenant-resolver";
import { getCustomerSession } from "@/modules/customers/customer-session";
import { AuthForm } from "./auth-form";

export default async function CustomerLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ subdomain: string }>;
  searchParams: Promise<{ returnTo?: string; modo?: string }>;
}) {
  const { subdomain } = await params;
  const store = await getStoreBySubdomain(subdomain);
  if (!store) notFound();

  const [session, { returnTo, modo }] = await Promise.all([
    getCustomerSession(store.id),
    searchParams,
  ]);
  if (session) redirect(`/loja/${subdomain}/conta`);

  const defaultTab = modo === "cadastro" ? "register" : "login";

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">
        {defaultTab === "register" ? "Criar conta" : "Entrar"}
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        {defaultTab === "register"
          ? "Cadastre-se para acompanhar seus pedidos e avaliar suas compras."
          : "Acesse sua conta para ver seus pedidos."}
      </p>
      <AuthForm subdomain={subdomain} returnTo={returnTo ?? null} defaultTab={defaultTab} />
    </div>
  );
}
