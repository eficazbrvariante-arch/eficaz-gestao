import { z } from "zod";

/** Só dígitos — remove pontuação de CPF antes de comparar/salvar. */
export function normalizeDocument(document: string) {
  return document.replace(/\D/g, "");
}

/**
 * Valida o dígito verificador do CPF — só usado no cadastro público
 * (autoatendimento), mais exposto a erro de digitação e fraude simples do
 * que o cadastro manual do Admin/Gerente.
 */
export function isValidCPF(document: string): boolean {
  const digits = normalizeDocument(document);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  const checkDigit = (base: string) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += Number(base[i]) * (base.length + 1 - i);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return (
    checkDigit(digits.slice(0, 9)) === Number(digits[9]) &&
    checkDigit(digits.slice(0, 10)) === Number(digits[10])
  );
}

export const convenioSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da empresa parceira"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Informe um identificador")
    .regex(/^[a-z0-9-]+$/, "Use só letras minúsculas, números e hífen"),
  logoUrl: z.string().trim().optional().or(z.literal("")),
  responsibleName: z.string().trim().optional().or(z.literal("")),
  responsiblePhone: z.string().trim().optional().or(z.literal("")),
  active: z.boolean(),
  benefitAmount: z.coerce.number().min(0, "O valor não pode ser negativo"),
  requireProof: z.boolean(),
  usesPerPeriod: z.coerce.number().int().min(1, "Pelo menos 1 uso por período"),
  periodDays: z.coerce.number().int().min(1, "Pelo menos 1 dia"),
});
export type ConvenioInput = z.infer<typeof convenioSchema>;
/** Forma "crua" dos campos no formulário, antes do `z.coerce` dos números — ver `ProductFormValues`. */
export type ConvenioFormValues = z.input<typeof convenioSchema>;

export const convenioMemberSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do colaborador"),
  document: z
    .string()
    .trim()
    .transform(normalizeDocument)
    .refine((value) => value.length === 11, "Informe um CPF com 11 dígitos"),
  phone: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().email("E-mail inválido").optional().or(z.literal("")),
  selfieUrl: z.string().trim().min(1, "Envie a foto do colaborador"),
  // Obrigatório nesta fase (cadastro manual, só Havan) — a partir da Fase 2 o
  // formulário público passa a decidir isso dinamicamente por
  // `Convenio.rules.requireProof`, por convênio.
  proofUrl: z.string().trim().min(1, "Envie o comprovante do colaborador"),
  validUntil: z.string().optional().or(z.literal("")),
});
export type ConvenioMemberInput = z.infer<typeof convenioMemberSchema>;

export const CONVENIO_MEMBER_STATUSES = [
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "BLOCKED",
  "CANCELLED",
] as const;
export type ConvenioMemberStatusValue = (typeof CONVENIO_MEMBER_STATUSES)[number];

export const CONVENIO_MEMBER_STATUS_LABELS: Record<ConvenioMemberStatusValue, string> = {
  PENDING: "Pendente de aprovação",
  ACTIVE: "Ativo",
  SUSPENDED: "Suspenso",
  BLOCKED: "Bloqueado",
  CANCELLED: "Cancelado",
};

export type ConvenioRules = {
  /** Valor fixo do benefício, em R$ (percentual fica pra quando algum convênio precisar de fato). */
  benefitAmount: number;
  requireProof: boolean;
  usesPerPeriod: number;
  periodDays: number;
};

/** Lê `Convenio.rules` (Json) com um formato seguro, mesmo se o JSON vier incompleto. */
export function parseConvenioRules(rules: unknown): ConvenioRules {
  const value = (rules ?? {}) as Partial<ConvenioRules>;
  return {
    benefitAmount: typeof value.benefitAmount === "number" ? value.benefitAmount : 0,
    requireProof: typeof value.requireProof === "boolean" ? value.requireProof : true,
    usesPerPeriod: typeof value.usesPerPeriod === "number" ? value.usesPerPeriod : 1,
    periodDays: typeof value.periodDays === "number" ? value.periodDays : 1,
  };
}

export const updateConvenioMemberStatusSchema = z.object({
  status: z.enum(CONVENIO_MEMBER_STATUSES),
  reason: z.string().trim().optional().or(z.literal("")),
});
export type UpdateConvenioMemberStatusInput = z.infer<typeof updateConvenioMemberStatusSchema>;

/** Forma dos campos do formulário público — igual nos dois casos de `requireProof`; o que muda é só a obrigatoriedade de `proofUrl`, decidida em runtime pela regra do convênio. */
export type ConvenioSignupInput = {
  name: string;
  document: string;
  phone: string;
  email?: string;
  selfieUrl: string;
  proofUrl?: string;
  consent: boolean;
};

/**
 * Cadastro por autoatendimento (link público, Fase 2) — o próprio
 * colaborador preenche. `requireProof` vem da regra do convênio
 * (`Convenio.rules.requireProof`), então o schema é montado por convênio,
 * não fixo como `convenioMemberSchema` (cadastro manual do Admin).
 */
export function buildConvenioSignupSchema(requireProof: boolean) {
  return z.object({
    name: z.string().trim().min(1, "Informe seu nome completo"),
    document: z
      .string()
      .trim()
      .transform(normalizeDocument)
      .refine(isValidCPF, "Informe um CPF válido"),
    phone: z.string().trim().min(8, "Informe um telefone de contato"),
    email: z.string().trim().email("E-mail inválido").optional().or(z.literal("")),
    selfieUrl: z.string().trim().min(1, "Tire sua foto para continuar"),
    proofUrl: requireProof
      ? z.string().trim().min(1, "Envie o comprovante para continuar")
      : z.string().trim().optional().or(z.literal("")),
    consent: z.boolean().refine((v) => v === true, "É preciso aceitar os termos para continuar"),
  });
}
