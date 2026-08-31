import Link from "next/link";

export function BackToAccountLink({ base }: { base: string }) {
  return (
    <Link
      href={`${base}/conta`}
      className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 hover:underline"
    >
      ← Voltar para Minha Conta
    </Link>
  );
}
