import { notFound } from "next/navigation";
import Link from "next/link";
import { getStoreBySubdomain } from "@/modules/catalog/tenant-resolver";
import { RequestResetForm } from "./request-reset-form";

export default async function CustomerForgotPasswordPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const store = await getStoreBySubdomain(subdomain);
  if (!store) notFound();

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Recuperar senha</h1>
      <p className="mb-6 text-sm text-slate-500">
        Informe o e-mail cadastrado na sua conta para receber instruções de redefinição.
      </p>

      <RequestResetForm subdomain={subdomain} />

      <div className="mt-6 text-sm">
        <Link href={`/loja/${subdomain}/conta/entrar`} className="text-slate-600 hover:text-slate-900">
          Voltar para o login
        </Link>
      </div>
    </div>
  );
}
