import { ResetPasswordForm } from "./reset-password-form";

export default async function RedefinirSenhaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Definir nova senha</h1>
      <p className="mb-6 text-sm text-slate-500">Escolha uma nova senha para sua conta.</p>

      <ResetPasswordForm token={token} />
    </div>
  );
}
