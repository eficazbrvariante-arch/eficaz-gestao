import { notFound, redirect } from "next/navigation";
import { getStoreBySubdomain } from "@/modules/catalog/tenant-resolver";
import { getCustomerSession } from "@/modules/customers/customer-session";
import { LoginForm } from "./login-form";

export default async function CustomerLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ subdomain: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { subdomain } = await params;
  const store = await getStoreBySubdomain(subdomain);
  if (!store) notFound();

  const [session, { returnTo }] = await Promise.all([getCustomerSession(store.id), searchParams]);
  if (session) redirect(`/loja/${subdomain}/conta`);

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Entrar</h1>
      <p className="mb-6 text-sm text-slate-500">Acesse sua conta para ver seus pedidos.</p>
      <LoginForm subdomain={subdomain} returnTo={returnTo ?? null} />
    </div>
  );
}
