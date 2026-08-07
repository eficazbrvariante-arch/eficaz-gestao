import { storeCityLabel, type Store } from "@/modules/catalog/tenant-resolver";

/**
 * Destaca a vantagem de estoque local + entrega rápida — só aparece quando a
 * loja realmente tem entrega e/ou retirada ligadas, e o texto é montado a
 * partir do `Tenant` (cidade, o que está ligado), nunca fixo pra uma loja
 * específica, pra servir qualquer lojista da plataforma.
 */
export function ExpressDeliveryBanner({ store }: { store: Store }) {
  if (!store.deliveryEnabled && !store.pickupEnabled) return null;

  const city = storeCityLabel(store);
  const headline = city ? `Precisou hoje? Receba rápido em ${city}.` : "Precisou hoje? Receba rápido.";

  const parts = [
    "Produtos em estoque",
    store.deliveryEnabled ? "Entrega rápida" : null,
    store.pickupEnabled ? "Retire na loja" : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <section className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div>
        <p className="text-sm font-semibold" style={{ color: "var(--store-primary)" }}>
          {headline}
        </p>
        <p className="text-xs text-slate-600">{parts.join(" • ")}</p>
      </div>
      <p className="shrink-0 text-[11px] text-slate-400 sm:text-right">
        Consulte disponibilidade e região de entrega.
      </p>
    </section>
  );
}
