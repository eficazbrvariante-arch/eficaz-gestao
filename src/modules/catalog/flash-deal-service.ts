import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { todayWeekday } from "./tenant-resolver";
import { FLASH_DEAL_ICON_OPTIONS, type FlashDealIconKey } from "@/lib/flash-deal-icons";

/** Uma linha da Oferta Relâmpago, guardada em `Tenant.flashDealSchedule` (Json). */
export type FlashDealDayEntry = {
  /** 0 = domingo … 6 = sábado, mesma convenção de `businessHours`/`Date#getDay()`. */
  day: number;
  active: boolean;
  productId: string | null;
  promoPrice: number | null;
  /** Máximo de unidades desse produto por carrinho enquanto a oferta do dia está ativa. */
  orderLimit: number;
  badgeText: string;
  icon: FlashDealIconKey;
  bgColor: string;
  accentColor: string;
  soundEnabled: boolean;
};

const ICON_KEYS = new Set<string>(FLASH_DEAL_ICON_OPTIONS.map((o) => o.value));
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function parseFlashDealSchedule(value: unknown): FlashDealDayEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is FlashDealDayEntry => {
    if (typeof entry !== "object" || entry === null) return false;
    const e = entry as Record<string, unknown>;
    return (
      typeof e.day === "number" &&
      e.day >= 0 &&
      e.day <= 6 &&
      typeof e.active === "boolean" &&
      (e.productId === null || typeof e.productId === "string") &&
      (e.promoPrice === null || typeof e.promoPrice === "number") &&
      typeof e.orderLimit === "number" &&
      typeof e.badgeText === "string" &&
      typeof e.icon === "string" &&
      ICON_KEYS.has(e.icon) &&
      typeof e.bgColor === "string" &&
      HEX_COLOR.test(e.bgColor) &&
      typeof e.accentColor === "string" &&
      HEX_COLOR.test(e.accentColor) &&
      typeof e.soundEnabled === "boolean"
    );
  });
}

/**
 * Entrada de hoje na agenda, ou `null` se o dia estiver desligado/sem produto — sem fallback.
 *
 * `now` é opcional (default = agora de verdade) só para permitir testar os 7 dias da semana
 * de forma determinística, sem mexer no relógio do sistema nem em nenhum caminho de produção
 * (nenhuma requisição HTTP expõe esse parâmetro).
 */
export function todayFlashDealEntry(schedule: FlashDealDayEntry[], now: Date = new Date()): FlashDealDayEntry | null {
  const day = todayWeekday(now);
  const entry = schedule.find((e) => e.day === day) ?? null;
  if (!entry || !entry.active || !entry.productId || entry.promoPrice === null) return null;
  return entry;
}

/**
 * Se `entry` é a Oferta Relâmpago vigente para `product`, o preço promocional
 * e o horário em que ela vira (meia-noite). `null` quando não bate (produto
 * diferente) ou quando o preço configurado não é de fato um desconto —
 * uma oferta mal configurada simplesmente não aparece, nunca "engana" o preço.
 */
export function flashPriceOverrideFor(
  entry: FlashDealDayEntry | null,
  product: { id: string; salePrice: number },
  now: Date = new Date()
): { promoPrice: number; endsAt: Date } | null {
  if (!entry || entry.productId !== product.id || entry.promoPrice === null) return null;
  if (entry.promoPrice >= product.salePrice) return null;
  return { promoPrice: entry.promoPrice, endsAt: nextMidnightSaoPaulo(now) };
}

/**
 * Meia-noite de hoje em America/Sao_Paulo, como instante UTC. Sem lib de
 * fuso horário: o Brasil não tem mais horário de verão desde 2019, então o
 * deslocamento -03:00 é fixo o ano inteiro.
 */
export function nextMidnightSaoPaulo(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const todayMidnight = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00-03:00`);
  return new Date(todayMidnight.getTime() + 24 * 60 * 60 * 1000);
}

/** Agenda da Oferta Relâmpago do tenant, com dedupe por requisição (como `getStoreBySubdomain`). */
export const getFlashDealSchedule = cache(async (tenantId: string): Promise<FlashDealDayEntry[]> => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { flashDealSchedule: true },
  });
  return parseFlashDealSchedule(tenant?.flashDealSchedule);
});

export type FlashDealVariant = {
  id: string;
  name: string;
  priceAdjustment: number;
  stockQty: number;
};

export type ResolvedFlashDeal = {
  productId: string;
  productName: string;
  imageUrl: string | null;
  basePrice: number;
  promoPrice: number;
  savingsAmount: number;
  savingsPercent: number;
  hasVariants: boolean;
  /** Vazio quando `hasVariants` é falso. Usado pelo seletor de variante do popup. */
  variants: FlashDealVariant[];
  stockQty: number;
  orderLimit: number;
  badgeText: string;
  icon: FlashDealIconKey;
  bgColor: string;
  accentColor: string;
  soundEnabled: boolean;
  endsAt: Date;
};

/**
 * Oferta Relâmpago de hoje, pronta para o popup da loja — ou `null` se o dia
 * está desligado, sem produto, ou o produto não está mais disponível
 * (inativo, fora do catálogo, sem estoque). Sem fallback: nesses casos o
 * popup simplesmente não aparece.
 *
 * `now` é opcional (ver `todayFlashDealEntry`) — só para testar os 7 dias da
 * semana deterministicamente; nenhum caminho de produção passa esse parâmetro.
 * Continua envolta em `cache()`: o dedupe do React funciona pelos argumentos
 * recebidos na chamada — quem não passa `now` continua deduplicando
 * corretamente por `tenantId` dentro do mesmo render, como antes.
 */
export const getTodayFlashDeal = cache(
  async (tenantId: string, now: Date = new Date()): Promise<ResolvedFlashDeal | null> => {
    const schedule = await getFlashDealSchedule(tenantId);
    const entry = todayFlashDealEntry(schedule, now);
    if (!entry || !entry.productId) return null;

    const product = await prisma.product.findFirst({
      where: {
        id: entry.productId,
        tenantId,
        active: true,
        showInCatalog: true,
        stockQty: { gt: 0 },
      },
      select: {
        id: true,
        name: true,
        salePrice: true,
        stockQty: true,
        images: { select: { url: true }, orderBy: { order: "asc" }, take: 1 },
        variants: { select: { id: true, name: true, priceAdjustment: true, stockQty: true } },
      },
    });
    if (!product) return null;

    const basePrice = Number(product.salePrice);
    const override = flashPriceOverrideFor(entry, { id: product.id, salePrice: basePrice }, now);
    if (!override) return null;

    const savingsAmount = Math.round((basePrice - override.promoPrice) * 100) / 100;
    const savingsPercent = Math.round((savingsAmount / basePrice) * 100);

    return {
      productId: product.id,
      productName: product.name,
      imageUrl: product.images[0]?.url ?? null,
      basePrice,
      promoPrice: override.promoPrice,
      savingsAmount,
      savingsPercent,
      hasVariants: product.variants.length > 0,
      variants: product.variants.map((v) => ({
        id: v.id,
        name: v.name,
        priceAdjustment: Number(v.priceAdjustment),
        stockQty: v.stockQty,
      })),
      stockQty: product.stockQty,
      orderLimit: entry.orderLimit,
      badgeText: entry.badgeText,
      icon: entry.icon,
      bgColor: entry.bgColor,
      accentColor: entry.accentColor,
      soundEnabled: entry.soundEnabled,
      endsAt: override.endsAt,
    };
  }
);
