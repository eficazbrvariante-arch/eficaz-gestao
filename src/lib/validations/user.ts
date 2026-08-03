import { z } from "zod";

export const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Administrador", hint: "Acesso total, inclusive configurações e usuários" },
  { value: "MANAGER", label: "Gerente", hint: "Vende, gerencia estoque, dá desconto e vê relatórios" },
  { value: "SELLER", label: "Vendedor", hint: "Vende no PDV e abre caixa; não dá desconto nem cancela" },
  { value: "STOCKIST", label: "Estoquista", hint: "Cuida de produtos e estoque; não vende" },
  {
    value: "STOCK_COLLABORATOR",
    label: "Colaborador de Estoque",
    hint: "Só vê a foto e ajusta a quantidade em estoque; sem acesso a preços ou a mais nada no painel",
  },
] as const;

const ROLE_VALUES = ["ADMIN", "MANAGER", "SELLER", "STOCKIST", "STOCK_COLLABORATOR"] as const;

export const createUserSchema = z
  .object({
    name: z.string().trim().min(3, "Informe o nome completo"),
    email: z.string().trim().toLowerCase().email("Informe um e-mail válido"),
    role: z.enum(ROLE_VALUES),
    password: z.string().min(8, "A senha deve ter no mínimo 8 caracteres"),
    confirmPassword: z.string().min(1, "Confirme a senha"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não conferem",
    path: ["confirmPassword"],
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const changeRoleSchema = z.object({
  userId: z.string().trim().min(1),
  role: z.enum(ROLE_VALUES),
});
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;

export const resetUserPasswordSchema = z
  .object({
    userId: z.string().trim().min(1),
    password: z.string().min(8, "A senha deve ter no mínimo 8 caracteres"),
    confirmPassword: z.string().min(1, "Confirme a senha"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não conferem",
    path: ["confirmPassword"],
  });
export type ResetUserPasswordInput = z.infer<typeof resetUserPasswordSchema>;
