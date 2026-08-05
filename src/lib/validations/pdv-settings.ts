import { z } from "zod";

export const pdvSettingsSchema = z.object({
  autoPrintReceipt: z.boolean(),
});
export type PdvSettingsInput = z.infer<typeof pdvSettingsSchema>;
export type PdvSettingsFormValues = z.input<typeof pdvSettingsSchema>;
