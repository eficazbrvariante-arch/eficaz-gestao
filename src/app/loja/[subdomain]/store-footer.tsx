import Link from "next/link";
import { storeDisplayName, type Store } from "@/modules/catalog/tenant-resolver";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/validations/store-settings";
import { TrustBar } from "./trust-bar";

function whatsappLink(whatsapp: string) {
  const digits = whatsapp.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent("Olá, vim pelo catálogo online!")}`;
}

const INSTITUTIONAL_LINKS = [
  { field: "aboutText", slug: "sobre", label: "Quem somos" },
  { field: "exchangePolicy", slug: "trocas", label: "Política de troca" },
  { field: "warrantyPolicy", slug: "garantia", label: "Garantia" },
  { field: "privacyPolicy", slug: "privacidade", label: "Política de privacidade" },
] as const;

export function StoreFooter({ store }: { store: Store }) {
  const name = storeDisplayName(store);
  const base = `/loja/${store.subdomain}`;
  const addressParts = [
    store.addressStreet,
    store.addressNumber,
    store.addressCity,
    store.addressState,
  ].filter(Boolean);

  const institutionalLinks = INSTITUTIONAL_LINKS.filter((link) => Boolean(store[link.field]));
  const paymentLabels = PAYMENT_METHOD_OPTIONS.filter((option) =>
    (store.acceptedPaymentMethods as string[]).includes(option.value)
  );

  return (
    <footer className="mt-10 border-t border-slate-200 bg-slate-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <TrustBar store={store} />

        <div className="mt-8 grid grid-cols-1 gap-8 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-semibold text-slate-900">{name}</p>
            {addressParts.length > 0 && (
              <p className="mt-1 text-slate-600">{addressParts.join(", ")}</p>
            )}
            {store.phone && <p className="mt-1 text-slate-600">Telefone: {store.phone}</p>}
            <div className="mt-2 flex flex-col gap-1">
              {store.whatsapp && (
                <a
                  href={whatsappLink(store.whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-slate-900 hover:underline"
                >
                  Falar no WhatsApp
                </a>
              )}
              {store.instagramUrl && (
                <a
                  href={store.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-slate-900 hover:underline"
                >
                  Instagram
                </a>
              )}
            </div>
          </div>

          {institutionalLinks.length > 0 && (
            <div>
              <p className="font-semibold text-slate-900">Institucional</p>
              <ul className="mt-2 space-y-1">
                {institutionalLinks.map((link) => (
                  <li key={link.slug}>
                    <Link href={`${base}/institucional/${link.slug}`} className="text-slate-600 hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {paymentLabels.length > 0 && (
            <div>
              <p className="font-semibold text-slate-900">Formas de pagamento</p>
              <ul className="mt-2 space-y-0.5 text-slate-600">
                {paymentLabels.map((option) => (
                  <li key={option.value}>{option.label}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <p className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">
          Catálogo online · os preços e a disponibilidade podem mudar sem aviso.
        </p>
      </div>
    </footer>
  );
}
