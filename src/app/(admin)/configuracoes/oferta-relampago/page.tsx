import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { parseFlashDealSchedule, type FlashDealDayEntry } from "@/modules/catalog/flash-deal-service";
import { FlashDealScheduleForm } from "./flash-deal-schedule-form";
import type { FlashDealScheduleFormValues } from "@/lib/validations/flash-deal";

function defaultFlashDealSchedule(): FlashDealDayEntry[] {
  return Array.from({ length: 7 }, (_, day) => ({
    day,
    active: false,
    productId: null,
    promoPrice: null,
    orderLimit: 1,
    badgeText: "",
    icon: "lightning",
    bgColor: "#b91c1c",
    accentColor: "#fbbf24",
    soundEnabled: false,
  }));
}

export default async function OfertaRelampagoPage() {
  const user = await requireUser();

  const [tenant, products] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { flashDealSchedule: true },
    }),
    prisma.product.findMany({
      where: { tenantId: user.tenantId, active: true, showInCatalog: true },
      select: { id: true, name: true, salePrice: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const storedSchedule = parseFlashDealSchedule(tenant.flashDealSchedule);
  const schedule =
    storedSchedule.length === 7
      ? storedSchedule.sort((a, b) => a.day - b.day)
      : defaultFlashDealSchedule();

  const defaultValues: FlashDealScheduleFormValues = {
    schedule: schedule.map((entry) => ({
      day: entry.day,
      active: entry.active,
      productId: entry.productId ?? undefined,
      promoPrice: entry.promoPrice ?? undefined,
      orderLimit: entry.orderLimit,
      badgeText: entry.badgeText,
      icon: entry.icon,
      bgColor: entry.bgColor,
      accentColor: entry.accentColor,
      soundEnabled: entry.soundEnabled,
    })),
  };

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-foreground">Oferta Relâmpago</h1>
      <p className="mb-6 text-sm text-text-muted">
        Configure um produto e um preço promocional para cada dia da semana. A loja mostra
        automaticamente só a oferta do dia de hoje e troca sozinha à meia-noite — dias
        desativados ou sem produto configurado não exibem nada.
      </p>

      <div className="max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <FlashDealScheduleForm
          defaultValues={defaultValues}
          products={products.map((p) => ({ id: p.id, name: p.name, salePrice: Number(p.salePrice) }))}
        />
      </div>
    </div>
  );
}
