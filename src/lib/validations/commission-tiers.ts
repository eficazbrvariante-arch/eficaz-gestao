import { z } from "zod";

const money = z.coerce.number().min(0, "Informe um valor válido");

/**
 * Uma faixa do formulário de configuração — `maxAmount` vazio/undefined
 * significa "sem teto" (só a última faixa ativa pode ficar assim, validado
 * no `.superRefine` abaixo).
 */
const commissionTierFormSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome pra faixa (ex.: Bronze)"),
  order: z.coerce.number().int().min(0),
  minAmount: money,
  // `z.coerce.number()` converte tanto "" quanto `null` em 0 sem erro — se
  // `money` vier primeiro no union, ele "vence" e `z.null()` nunca chega a
  // ser tentado. Por isso: (1) normaliza "sem teto" (campo vazio/undefined)
  // pra `null` antes da coerção, e (2) tenta `z.null()` ANTES de `money` no
  // union. Sem os dois, a última faixa ("sem teto") persiste com teto 0.
  maxAmount: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.union([z.null(), money])),
  percent: z.coerce.number().min(0, "Informe um percentual válido").max(100, "Percentual não pode passar de 100"),
  active: z.boolean(),
});

export const saveCommissionTiersSchema = z
  .object({
    tiers: z.array(commissionTierFormSchema).min(1, "Configure pelo menos uma faixa"),
    // "current" só é aceito pelo servidor uma única vez por tenant (primeira
    // configuração do mês corrente, pedido explícito do usuário pra valer
    // imediatamente) — depois disso o servidor recusa (ver `saveTiersForMonth`).
    target: z.enum(["current", "next"]).default("next"),
  })
  .superRefine((data, ctx) => {
    const active = [...data.tiers]
      .filter((t) => t.active)
      .sort((a, b) => a.order - b.order || a.minAmount - b.minAmount);
    if (active.length === 0) {
      ctx.addIssue({ code: "custom", message: "Pelo menos uma faixa precisa estar ativa", path: ["tiers"] });
      return;
    }
    if (active[0].minAmount !== 0) {
      ctx.addIssue({
        code: "custom",
        message: "A primeira faixa ativa precisa começar em R$ 0",
        path: ["tiers"],
      });
    }
    for (let i = 0; i < active.length; i++) {
      const tier = active[i];
      const isLast = i === active.length - 1;
      if (isLast) {
        continue;
      }
      if (tier.maxAmount === null) {
        ctx.addIssue({
          code: "custom",
          message: `A faixa "${tier.name}" precisa de um valor final (só a última faixa pode ficar sem teto)`,
          path: ["tiers"],
        });
        continue;
      }
      const next = active[i + 1];
      if (next.minAmount !== tier.maxAmount) {
        ctx.addIssue({
          code: "custom",
          message: `"${tier.name}" termina em ${tier.maxAmount}, mas "${next.name}" começa em ${next.minAmount} — as faixas precisam ser contínuas, sem espaço nem sobreposição`,
          path: ["tiers"],
        });
      }
    }
  });
export type SaveCommissionTiersInput = z.infer<typeof saveCommissionTiersSchema>;
export type SaveCommissionTiersFormValues = z.input<typeof saveCommissionTiersSchema>;

export const simulateCommissionSchema = z.object({
  totalSales: z.coerce.number().min(0, "Informe um valor válido"),
});
export type SimulateCommissionInput = z.infer<typeof simulateCommissionSchema>;
