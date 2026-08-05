import { z } from "zod";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const businessHourEntrySchema = z.object({
  day: z.number().int().min(0).max(6),
  opensAt: z.string().regex(timePattern, "Horário inválido"),
  closesAt: z.string().regex(timePattern, "Horário inválido"),
  closed: z.boolean(),
});
export type BusinessHourEntryInput = z.infer<typeof businessHourEntrySchema>;

export const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

export const PAYMENT_METHOD_OPTIONS = [
  { value: "CASH", label: "Dinheiro" },
  { value: "PIX", label: "Pix" },
  { value: "DEBIT", label: "Cartão de débito" },
  { value: "CREDIT", label: "Cartão de crédito" },
  { value: "TO_ARRANGE", label: "A combinar" },
] as const;

export const storeSettingsSchema = z.object({
  businessHours: z.array(businessHourEntrySchema).length(7),
  aboutText: z.string().trim().optional().or(z.literal("")),
  exchangePolicy: z.string().trim().optional().or(z.literal("")),
  warrantyPolicy: z.string().trim().optional().or(z.literal("")),
  privacyPolicy: z.string().trim().optional().or(z.literal("")),
  acceptedPaymentMethods: z.array(
    z.enum(["CASH", "PIX", "DEBIT", "CREDIT", "TO_ARRANGE"])
  ),
  installmentsEnabled: z.boolean(),
  maxInstallments: z
    .union([z.literal(""), z.coerce.number().int().min(2).max(24)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  minInstallmentValue: z
    .union([z.literal(""), z.coerce.number().min(0)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
});
export type StoreSettingsInput = z.infer<typeof storeSettingsSchema>;
// Tipo "de entrada" (antes da coerção do zod) — usado pelo useForm, já que os
// campos numéricos de parcelamento chegam como string dos inputs HTML.
export type StoreSettingsFormValues = z.input<typeof storeSettingsSchema>;
