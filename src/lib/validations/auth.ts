import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido"),
  password: z.string().min(1, "Informe sua senha"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Login por seleção de nome (dispositivo já aprovado) — sem digitar e-mail. */
export const selectUserLoginSchema = z.object({
  userId: z.string().trim().min(1),
  password: z.string().min(1, "Informe sua senha"),
});

export type SelectUserLoginInput = z.infer<typeof selectUserLoginSchema>;

export const requestPasswordResetSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido"),
});

export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8, "A senha deve ter no mínimo 8 caracteres"),
    confirmPassword: z.string().min(1, "Confirme a nova senha"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não conferem",
    path: ["confirmPassword"],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const signupSchema = z
  .object({
    companyName: z.string().trim().min(2, "Informe o nome da empresa"),
    subdomain: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, "Mínimo de 3 caracteres")
      .max(40, "Máximo de 40 caracteres")
      .regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífen"),
    adminName: z.string().trim().min(2, "Informe seu nome"),
    email: z.string().trim().toLowerCase().email("Informe um e-mail válido"),
    password: z.string().min(8, "A senha deve ter no mínimo 8 caracteres"),
    confirmPassword: z.string().min(1, "Confirme a senha"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não conferem",
    path: ["confirmPassword"],
  });

export type SignupInput = z.infer<typeof signupSchema>;
