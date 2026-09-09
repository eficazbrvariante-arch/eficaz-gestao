import { z } from "zod";

/**
 * Configuração do desconto automático de combo (ver `lib/combo-discount.ts`).
 *
 * As listas chegam do formulário como texto separado por vírgula — é o jeito
 * mais direto de editar no balcão, sem inventar um editor de tags. A
 * normalização (minúscula/acento) NÃO acontece aqui de propósito: o valor é
 * guardado como a pessoa digitou, pra ela reconhecer o que escreveu quando
 * voltar na tela; quem normaliza é `combo-discount.ts`, na hora de comparar.
 */
const keywordList = z
  .string()
  .trim()
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );

export const comboDiscountSettingsSchema = z.object({
  capinhaKeywords: keywordList.refine((list) => list.length > 0, {
    message: "Informe pelo menos uma palavra para identificar a capinha.",
  }),
  hidrogelKeywords: keywordList.refine((list) => list.length > 0, {
    message: "Informe pelo menos uma palavra para identificar a película de hidrogel.",
  }),
  // Pode ficar vazia — é legítimo não excluir nada.
  excludeKeywords: keywordList,
  amountPerCombo: z.coerce
    .number()
    .min(0, "O valor do desconto não pode ser negativo.")
    .max(9999, "Valor muito alto para um desconto de combo."),
});

export type ComboDiscountSettingsInput = z.input<typeof comboDiscountSettingsSchema>;
export type ComboDiscountSettingsValues = z.infer<typeof comboDiscountSettingsSchema>;
