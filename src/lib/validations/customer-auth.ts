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
      // Checado antes do min(3): sem isso, campo vazio cairia direto no erro
      // de "mínimo de 3 caracteres" em vez de avisar que é obrigatório.
      .min(1, "Campo obrigatório")
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

/** Cadastro fora do checkout (botão "Cadastrar" do cabeçalho) — mesmos dados pedidos na aba "Criar conta" do checkout, sem pedido nenhum junto. */
export const registerCustomerSchema = z.object({
  name: z.string().trim().min(3, "Informe seu nome completo"),
  phone: z
    .string()
    .trim()
    .refine((v) => v.replace(/\D/g, "").length >= 10, "Informe um telefone válido com DDD"),
  email: z.string().trim().email("Informe um e-mail válido").optional().or(z.literal("")),
  username: usernameSchema,
  password: passwordSchema,
});
export type RegisterCustomerInput = z.infer<typeof registerCustomerSchema>;

export const requestCustomerPasswordResetSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido"),
});
export type RequestCustomerPasswordResetInput = z.infer<typeof requestCustomerPasswordResetSchema>;

export const changeCustomerPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual"),
    newPassword: passwordSchema,
    confirmNewPassword: z.string().min(1, "Confirme a nova senha"),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "As senhas não conferem",
    path: ["confirmNewPassword"],
  });
export type ChangeCustomerPasswordInput = z.infer<typeof changeCustomerPasswordSchema>;

export const resetCustomerPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirme a nova senha"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não conferem",
    path: ["confirmPassword"],
  });
export type ResetCustomerPasswordInput = z.infer<typeof resetCustomerPasswordSchema>;

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
