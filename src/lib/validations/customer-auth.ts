import { z } from "zod";

/**
 * Única função de normalização de `@usuário`, usada em checagem de
 * disponibilidade, registro e login — pra nunca haver divergência entre os
 * três pontos (ex.: "@João" cadastrado, "joao" não encontrando no login).
 */
export function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/^@/, "");
}

export const usernameSchema = z
  .string()
  .transform(normalizeUsername)
  .pipe(
    z
      .string()
      .min(3, "Use pelo menos 3 caracteres")
      .max(20, "Use no máximo 20 caracteres")
      .regex(/^[a-z0-9_]+$/, "Use só letras minúsculas, números ou _")
  );

/**
 * bcrypt ignora silenciosamente qualquer byte além do 72º — validado em bytes
 * (não em `.length`) porque caracteres acentuados ocupam mais de 1 byte em UTF-8.
 */
export const passwordSchema = z
  .string()
  .min(8, "Mínimo de 8 caracteres")
  .refine((v) => Buffer.byteLength(v, "utf8") <= 72, "Senha muito longa");

const registerAuthSchema = z.object({
  authMode: z.literal("register"),
  username: usernameSchema,
  password: passwordSchema,
});

const loginAuthSchema = z.object({
  authMode: z.literal("login"),
  username: usernameSchema,
  password: z.string().min(1, "Informe a senha"),
});

const sessionAuthSchema = z.object({
  authMode: z.literal("session"),
});

/**
 * Validado sempre no servidor, independente do que a UI decidiu mostrar —
 * mesmo que a Server Action do checkout seja chamada direto (fora do
 * formulário), `authMode: "register"` sem `username`/`password` falha aqui
 * antes de tocar em qualquer lógica de negócio. `authMode: "session"` por si
 * só não basta: quem recebe esse valor ainda confere a sessão de verdade via
 * `getCustomerSession` antes de aceitar (ver `customer-session.ts`).
 */
export const checkoutAuthSchema = z.discriminatedUnion("authMode", [
  registerAuthSchema,
  loginAuthSchema,
  sessionAuthSchema,
]);
export type CheckoutAuthInput = z.infer<typeof checkoutAuthSchema>;

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "Informe a senha"),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * `returnTo` só é aceito se for um caminho relativo dentro da própria loja —
 * nunca uma URL externa. Usado depois do login de cliente feito fora do
 * checkout (ex.: clicou "Trocar de conta" no meio da compra).
 */
export function isSafeReturnTo(value: string | null | undefined, base: string): string | null {
  if (!value) return null;
  if (value.startsWith("//") || value.includes("://")) return null;
  if (value !== base && !value.startsWith(`${base}/`)) return null;
  return value;
}
