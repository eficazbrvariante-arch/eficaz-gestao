import { notFound } from "next/navigation";
import { getStoreBySubdomain } from "@/modules/catalog/tenant-resolver";
import { ResetPasswordForm } from "./reset-password-form";

export default async function CustomerResetPasswordPage({
  params,
}: {
  params: Promise<{ subdomain: string; token: string }>;
}) {
  const { subdomain, token } = await params;
  const store = await getStoreBySubdomain(subdomain);
  if (!store) notFound();

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Definir nova senha</h1>
      <p className="mb-6 text-sm text-slate-500">Escolha uma nova senha para sua conta.</p>

      <ResetPasswordForm subdomain={subdomain} token={token} />
    </div>
  );
}
