import { formatBRL } from "@/lib/format";

/**
 * Aviso fixo sobre frete grátis por faixa de entrega (`DeliveryZone.freeShippingMin`)
 * — informativo, nunca o cálculo do frete em si (esse é sempre recalculado no
 * servidor a partir do endereço real, ver `findDeliveryZone`). Some sozinho
 * quando a loja não tem nenhuma faixa com frete grátis configurada.
 */
export function FreeShippingNotice({
  zones,
}: {
  zones: { name: string; freeShippingMin: number }[];
}) {
  if (zones.length === 0) return null;

  return (
    <p className="text-xs text-emerald-700">
      {zones
        .map((zone) => `Entregas em ${zone.name} grátis nas compras a partir de ${formatBRL(zone.freeShippingMin)}.`)
        .join(" ")}
    </p>
  );
}
