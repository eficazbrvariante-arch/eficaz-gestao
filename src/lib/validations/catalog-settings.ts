import { z } from "zod";

const optionalUrl = z
  .union([z.string().trim().url("Informe uma URL válida"), z.literal("")])
  .optional();

export const catalogSettingsSchema = z.object({
  catalogEnabled: z.boolean().default(true),
  logoUrl: optionalUrl,
  bannerUrl: optionalUrl,
  bannerTitle: z.string().trim().max(120, "Máximo de 120 caracteres").optional().or(z.literal("")),
  bannerSubtitle: z
    .string()
    .trim()
    .max(200, "Máximo de 200 caracteres")
    .optional()
    .or(z.literal("")),
});

export type CatalogSettingsInput = z.infer<typeof catalogSettingsSchema>;
export type CatalogSettingsFormValues = z.input<typeof catalogSettingsSchema>;
