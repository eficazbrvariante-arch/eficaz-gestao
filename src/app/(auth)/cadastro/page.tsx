import Link from "next/link";
import { SignupForm } from "./signup-form";

export default function CadastroPage() {
  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Criar sua empresa</h1>
      <p className="mb-6 text-sm text-slate-500">
        Configure sua conta administradora no Eficaz Gestão.
      </p>

      <SignupForm />

      <div className="mt-6 text-sm">
        <span className="text-slate-500">
          Já tem uma conta?{" "}
          <Link href="/login" className="font-medium text-slate-900 hover:underline">
            Entrar
          </Link>
        </span>
      </div>
    </div>
  );
}
