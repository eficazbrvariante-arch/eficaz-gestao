import { notFound, redirect } from "next/navigation";
import { getStoreBySubdomain } from "@/modules/catalog/tenant-resolver";
import { getCustomerSession } from "@/modules/customers/customer-session";
import { isSafeReturnTo } from "@/lib/validations/customer-auth";
import { AuthForm } from "./auth-form";

export default async function CustomerLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ subdomain: string }>;
  searchParams: Promise<{ returnTo?: string; modo?: string; motivo?: string }>;
}) {
  const { subdomain } = await params;
  const store = await getStoreBySubdomain(subdomain);
  if (!store) notFound();

  const [session, { returnTo, modo, motivo }] = await Promise.all([
    getCustomerSession(store.id),
    searchParams,
  ]);
  const base = `/loja/${subdomain}`;
  if (session) redirect(isSafeReturnTo(returnTo, base) ?? `${base}/conta`);

  const defaultTab = modo === "cadastro" ? "register" : "login";
  const fromWhatsappCta = motivo === "comprar-whatsapp";

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">
        {defaultTab === "register" ? "Criar conta" : "Entrar"}
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        {fromWhatsappCta
          ? "Para o seu pedido aparecer no sistema da loja, efetue o cadastro básico abaixo (nome, telefone, @usuário e e-mail). Depois você segue direto para o WhatsApp."
          : defaultTab === "register"
            ? "Cadastre-se para acompanhar seus pedidos e avaliar suas compras."
            : "Acesse sua conta para ver seus pedidos."}
      </p>
      <AuthForm subdomain={subdomain} returnTo={returnTo ?? null} defaultTab={defaultTab} />
    </div>
  );
}
