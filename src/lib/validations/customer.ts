import { z } from "zod";

export const customerSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do cliente"),
  document: z.string().trim().optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  whatsapp: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().email("Informe um e-mail válido").optional().or(z.literal("")),
  addressStreet: z.string().trim().optional().or(z.literal("")),
  addressNumber: z.string().trim().optional().or(z.literal("")),
  addressCity: z.string().trim().optional().or(z.literal("")),
  addressState: z.string().trim().max(2, "Use a sigla do estado").optional().or(z.literal("")),
  addressZip: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
  /** Data de nascimento, formato `YYYY-MM-DD`. */
  birthDate: z.string().trim().optional().or(z.literal("")),
});

export type CustomerInput = z.infer<typeof customerSchema>;
