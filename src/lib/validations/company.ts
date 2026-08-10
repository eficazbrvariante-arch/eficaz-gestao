import { z } from "zod";

export const companySchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da empresa"),
  /// E-mail de acesso do PDV — identifica a empresa no primeiro login de
  /// cada dispositivo novo (ver `resolveTenantLoginAction`).
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido"),
  tradeName: z.string().trim().optional().or(z.literal("")),
  document: z.string().trim().optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  whatsapp: z.string().trim().optional().or(z.literal("")),
  instagramUrl: z.string().trim().optional().or(z.literal("")),
  addressStreet: z.string().trim().optional().or(z.literal("")),
  addressNumber: z.string().trim().optional().or(z.literal("")),
  addressCity: z.string().trim().optional().or(z.literal("")),
  addressState: z.string().trim().optional().or(z.literal("")),
  addressZip: z.string().trim().optional().or(z.literal("")),
  primaryColor: z.string().trim().optional().or(z.literal("")),
});

export type CompanyInput = z.infer<typeof companySchema>;
