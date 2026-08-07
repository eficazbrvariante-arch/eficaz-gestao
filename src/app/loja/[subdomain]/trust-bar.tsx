import { getStoreRatingSummary } from "@/modules/catalog/catalog-service";
import { storeCityLabel, type Store } from "@/modules/catalog/tenant-resolver";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/validations/store-settings";
import { AwardIcon, CardIcon, StarIcon, StorefrontIcon, TruckIcon, WhatsappIcon } from "./icons";

type TrustItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
};

/**
 * Cada item só aparece se corresponder a uma condição real configurada pela
 * loja (avaliação real, entrega/retirada ligadas, forma de pagamento
 * cadastrada, política de garantia escrita) — nunca um badge fixo no código.
 */
export async function TrustBar({ store }: { store: Store }) {
  const ratingSummary = await getStoreRatingSummary(store.id);
  const city = storeCityLabel(store);
  const paymentLabels = PAYMENT_METHOD_OPTIONS.filter((option) =>
    (store.acceptedPaymentMethods as string[]).includes(option.value)
  ).map((option) => option.label);

  const items: TrustItem[] = [];

  if (ratingSummary) {
    items.push({
      key: "rating",
      icon: <StarIcon filled className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />,
      label: `${ratingSummary.avgRating.toFixed(1)} · ${ratingSummary.reviewCount} avaliações`,
    });
  }

  if (store.deliveryEnabled) {
    items.push({
      key: "delivery",
      icon: <TruckIcon className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />,
      label: city ? `Entrega Rápida em ${city}` : "Entrega Rápida",
    });
  }

  if (store.pickupEnabled) {
    items.push({
      key: "pickup",
      icon: <StorefrontIcon className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />,
      label: "Retire na Loja",
    });
  }

  if (paymentLabels.length > 0) {
    items.push({
      key: "payment",
      icon: <CardIcon className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />,
      label: paymentLabels.join(" · "),
    });
  }

  if (store.warrantyPolicy) {
    items.push({
      key: "warranty",
      icon: <AwardIcon className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />,
      label: "Garantia",
    });
  }

  if (store.whatsapp) {
    items.push({
      key: "whatsapp",
      icon: <WhatsappIcon className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />,
      label: "Atendimento pelo WhatsApp",
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-3 sm:gap-x-3 sm:gap-y-3 sm:py-4 lg:grid-cols-5 lg:gap-x-2">
      {items.map((item) => (
        <div
          key={item.key}
          className="flex flex-col items-center gap-1 text-center sm:flex-row sm:gap-2 sm:text-left"
          style={{ color: "var(--store-primary)" }}
        >
          {item.icon}
          <span className="text-[11px] font-medium text-slate-700 sm:text-xs">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
