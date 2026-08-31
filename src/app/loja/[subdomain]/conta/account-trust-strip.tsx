import { TruckIcon, StorefrontIcon, WhatsappIcon, ShieldLockIcon } from "../icons";

export type TrustItem = {
  key: string;
  icon: (props: { className?: string }) => React.JSX.Element;
  label: string;
  sublabel?: string;
};

/** Monta a lista de selos de confiança só com informação real da loja
 *  (mesmos campos já usados no popup da Oferta Relâmpago) — nunca inventa
 *  um selo que a loja não ofereça de fato. */
export function buildTrustItems(store: {
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  whatsapp: string | null;
  cityLabel: string | null;
}): TrustItem[] {
  const items: TrustItem[] = [];
  if (store.deliveryEnabled) {
    items.push({
      key: "delivery",
      icon: TruckIcon,
      label: "Entrega rápida",
      sublabel: store.cityLabel ?? undefined,
    });
  }
  if (store.pickupEnabled) {
    items.push({ key: "pickup", icon: StorefrontIcon, label: "Retire na loja" });
  }
  if (store.whatsapp) {
    items.push({ key: "whatsapp", icon: WhatsappIcon, label: "Atendimento", sublabel: "Pelo WhatsApp" });
  }
  items.push({ key: "secure", icon: ShieldLockIcon, label: "Compra segura", sublabel: "Seus dados protegidos" });
  return items;
}

export function AccountTrustStrip({ items }: { items: TrustItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-slate-800 to-slate-900 p-4 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
            <item.icon className="h-4 w-4 text-emerald-400" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">{item.label}</p>
            {item.sublabel && <p className="truncate text-[11px] text-slate-400">{item.sublabel}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
