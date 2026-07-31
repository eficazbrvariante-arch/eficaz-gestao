import Link from "next/link";
import { RequestResetForm } from "./request-reset-form";

export default function RecuperarSenhaPage() {
  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Recuperar senha</h1>
      <p className="mb-6 text-sm text-slate-500">
        Informe o e-mail da sua conta para receber instruções de redefinição.
      </p>

      <RequestResetForm />

      <div className="mt-6 text-sm">
        <Link href="/login" className="text-slate-600 hover:text-slate-900">
          Voltar para o login
        </Link>
      </div>
    </div>
  );
}
