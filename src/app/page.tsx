import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Eficaz Gestão</h1>
      <p className="mt-3 max-w-md text-slate-600">
        Sistema de gestão comercial e PDV da EficazBr.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/login"
          className="rounded-md bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Entrar
        </Link>
        <Link
          href="/cadastro"
          className="rounded-md border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          Criar empresa
        </Link>
      </div>
    </div>
  );
}
