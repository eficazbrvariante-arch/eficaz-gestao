export default function StoreNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Loja não encontrada</h1>
      <p className="mt-2 max-w-md text-slate-600">
        Este catálogo não existe ou está indisponível no momento. Verifique o endereço ou tente
        novamente mais tarde.
      </p>
    </div>
  );
}
