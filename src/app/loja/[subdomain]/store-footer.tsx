import { storeDisplayName, type Store } from "@/modules/catalog/tenant-resolver";

function whatsappLink(whatsapp: string) {
  const digits = whatsapp.replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}

export function StoreFooter({ store }: { store: Store }) {
  const name = storeDisplayName(store);
  const addressParts = [
    store.addressStreet,
    store.addressNumber,
    store.addressCity,
    store.addressState,
  ].filter(Boolean);

  return (
    <footer className="mt-10 border-t border-slate-200 bg-slate-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 gap-6 text-sm sm:grid-cols-2">
          <div>
            <p className="font-semibold text-slate-900">{name}</p>
            {addressParts.length > 0 && (
              <p className="mt-1 text-slate-600">{addressParts.join(", ")}</p>
            )}
          </div>
          <div className="sm:text-right">
            {store.phone && <p className="text-slate-600">Telefone: {store.phone}</p>}
            {store.whatsapp && (
              <a
                href={whatsappLink(store.whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block font-medium text-slate-900 hover:underline"
              >
                Falar no WhatsApp
              </a>
            )}
          </div>
        </div>
        <p className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-400">
          Catálogo online · os preços e a disponibilidade podem mudar sem aviso.
        </p>
      </div>
    </footer>
  );
}
