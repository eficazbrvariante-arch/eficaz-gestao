import { z } from "zod";
import { FLASH_DEAL_ICON_OPTIONS, type FlashDealIconKey } from "@/lib/flash-deal-icons";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const ICON_VALUES = FLASH_DEAL_ICON_OPTIONS.map((o) => o.value) as [
  FlashDealIconKey,
  ...FlashDealIconKey[],
];

// Transformam para `undefined` (nunca `null`) de propósito: a Server Action
// roda este mesmo schema DE NOVO sobre o resultado já transformado (validação
// client-side com `zodResolver` + revalidação no servidor) — `.optional()` só
// aceita `undefined` de volta, `null` quebraria essa segunda passada com um
// "Invalid input" genérico. A conversão para `null` (formato de armazenamento
// em `Tenant.flashDealSchedule`) acontece só na Server Action, antes de salvar.
const optionalProductId = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : undefined));

const optionalPromoPrice = z
  .union([z.literal(""), z.coerce.number().positive("O preço promocional deve ser maior que zero")])
  .optional()
  .transform((v) => (v === "" ? undefined : v));

export const flashDealDayEntrySchema = z
  .object({
    day: z.number().int().min(0).max(6),
    active: z.boolean().default(false),
    productId: optionalProductId,
    promoPrice: optionalPromoPrice,
    orderLimit: z.coerce.number().int().min(1).max(20).default(1),
    badgeText: z.string().trim().max(40).default(""),
    icon: z.enum(ICON_VALUES).default("lightning"),
    bgColor: z.string().regex(HEX_COLOR, "Cor inválida").default("#b91c1c"),
    accentColor: z.string().regex(HEX_COLOR, "Cor inválida").default("#fbbf24"),
    soundEnabled: z.boolean().default(false),
  })
  .refine((data) => !data.active || (data.productId !== undefined && data.promoPrice !== undefined), {
    message: "Selecione um produto e informe o preço promocional para ativar a oferta do dia",
    path: ["productId"],
  });
export type FlashDealDayEntryInput = z.infer<typeof flashDealDayEntrySchema>;
export type FlashDealDayEntryFormValues = z.input<typeof flashDealDayEntrySchema>;

export const flashDealScheduleSchema = z.object({
  schedule: z.array(flashDealDayEntrySchema).length(7),
});
export type FlashDealScheduleInput = z.infer<typeof flashDealScheduleSchema>;
// Tipo "de entrada" (antes da coerção do zod) — usado pelo useForm, já que
// productId/promoPrice chegam como string dos inputs HTML antes de virar null/number.
export type FlashDealScheduleFormValues = z.input<typeof flashDealScheduleSchema>;
