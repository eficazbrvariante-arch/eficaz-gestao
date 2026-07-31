import { z } from "zod";

export const companySchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da empresa"),
  tradeName: z.string().trim().optional().or(z.literal("")),
  document: z.string().trim().optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  whatsapp: z.string().trim().optional().or(z.literal("")),
  addressStreet: z.string().trim().optional().or(z.literal("")),
  addressNumber: z.string().trim().optional().or(z.literal("")),
  addressCity: z.string().trim().optional().or(z.literal("")),
  addressState: z.string().trim().optional().or(z.literal("")),
  addressZip: z.string().trim().optional().or(z.literal("")),
  primaryColor: z.string().trim().optional().or(z.literal("")),
});

export type CompanyInput = z.infer<typeof companySchema>;
