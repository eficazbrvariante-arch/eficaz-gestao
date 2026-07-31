import type { Plan } from "@/generated/prisma/enums";

/**
 * Limites de cada plano.
 *
 * Ficam no código, e não no banco, porque um ajuste de plano vale para todas as
 * empresas de uma vez — sem migração e sem precisar atualizar cada registro.
 * `null` significa ilimitado.
 */
export type PlanLimits = {
  label: string;
  description: string;
  maxUsers: number | null;
  maxProducts: number | null;
  /** Preço mensal em reais; 0 no plano gratuito. */
  monthlyPrice: number;
};

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    label: "Gratuito",
    description: "Para começar a vender com o essencial.",
    maxUsers: 2,
    maxProducts: 100,
    monthlyPrice: 0,
  },
  PRO: {
    label: "Profissional",
    description: "Para lojas com equipe e catálogo maior.",
    maxUsers: 10,
    maxProducts: 5000,
    monthlyPrice: 79,
  },
  BUSINESS: {
    label: "Empresarial",
    description: "Sem limites de equipe nem de catálogo.",
    maxUsers: null,
    maxProducts: null,
    monthlyPrice: 199,
  },
};

export function planLimits(plan: Plan) {
  return PLAN_LIMITS[plan];
}

export type LimitCheck = { allowed: true } | { allowed: false; error: string };

/**
 * Verifica se ainda cabe mais um registro no plano.
 * Sempre chamada **no servidor**, antes de criar — a interface só esconde o botão.
 */
export function checkLimit(
  plan: Plan,
  kind: "users" | "products",
  currentCount: number
): LimitCheck {
  const limits = PLAN_LIMITS[plan];
  const max = kind === "users" ? limits.maxUsers : limits.maxProducts;

  if (max === null || currentCount < max) return { allowed: true };

  const what = kind === "users" ? "usuários" : "produtos";
  return {
    allowed: false,
    error: `Seu plano ${limits.label} permite até ${max} ${what}. Mude de plano para adicionar mais.`,
  };
}
