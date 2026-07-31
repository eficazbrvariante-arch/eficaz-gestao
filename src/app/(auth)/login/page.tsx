import Link from "next/link";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; sessao?: string }>;
}) {
  const { callbackUrl, sessao } = await searchParams;

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Entrar</h1>
      <p className="mb-6 text-sm text-slate-500">
        Acesse o painel administrativo da sua empresa.
      </p>

      {sessao === "expirada" && (
        <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Sua sessão não é mais válida. Entre novamente para continuar.
        </div>
      )}

      <LoginForm callbackUrl={callbackUrl} />

      <div className="mt-6 flex flex-col gap-2 text-sm">
        <Link href="/recuperar-senha" className="text-slate-600 hover:text-slate-900">
          Esqueci minha senha
        </Link>
        <span className="text-slate-500">
          Ainda não tem uma empresa cadastrada?{" "}
          <Link href="/cadastro" className="font-medium text-slate-900 hover:underline">
            Criar cadastro
          </Link>
        </span>
      </div>
    </div>
  );
}
