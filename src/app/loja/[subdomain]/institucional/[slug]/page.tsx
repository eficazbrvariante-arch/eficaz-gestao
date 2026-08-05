import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreBySubdomain, storeDisplayName, type Store } from "@/modules/catalog/tenant-resolver";

/** Páginas institucionais geradas a partir de texto livre cadastrado em Configurações → Loja. */
const INSTITUTIONAL_PAGES = {
  sobre: { title: "Quem somos", field: "aboutText" },
  trocas: { title: "Política de troca", field: "exchangePolicy" },
  garantia: { title: "Garantia", field: "warrantyPolicy" },
  privacidade: { title: "Política de privacidade", field: "privacyPolicy" },
} satisfies Record<string, { title: string; field: keyof Store }>;

type InstitutionalSlug = keyof typeof INSTITUTIONAL_PAGES;

function isInstitutionalSlug(slug: string): slug is InstitutionalSlug {
  return slug in INSTITUTIONAL_PAGES;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subdomain: string; slug: string }>;
}): Promise<Metadata> {
  const { subdomain, slug } = await params;
  if (!isInstitutionalSlug(slug)) return {};

  const store = await getStoreBySubdomain(subdomain);
  if (!store) return {};

  const { title } = INSTITUTIONAL_PAGES[slug];
  return { title: `${title} — ${storeDisplayName(store)}` };
}

export default async function InstitutionalPage({
  params,
}: {
  params: Promise<{ subdomain: string; slug: string }>;
}) {
  const { subdomain, slug } = await params;
  if (!isInstitutionalSlug(slug)) notFound();

  const store = await getStoreBySubdomain(subdomain);
  if (!store) notFound();

  const { title, field } = INSTITUTIONAL_PAGES[slug];
  const text = store[field] as string | null;
  if (!text) notFound();

  const base = `/loja/${store.subdomain}`;

  return (
    <div className="mx-auto max-w-2xl">
      <nav className="mb-6 text-sm text-slate-500">
        <Link href={base} className="hover:underline">
          Início
        </Link>
        <span> / </span>
        <span className="text-slate-700">{title}</span>
      </nav>
      <h1 className="mb-4 text-xl font-semibold text-slate-900">{title}</h1>
      <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{text}</p>
    </div>
  );
}
