import { z } from "zod";

export const reviewSchema = z.object({
  authorName: z.string().trim().min(2, "Informe o nome de quem avaliou"),
  rating: z.coerce.number().int("Selecione uma nota").min(1, "Selecione uma nota").max(5),
  comment: z.string().trim().optional().or(z.literal("")),
  source: z.string().trim().optional().or(z.literal("")),
});
export type ReviewInput = z.infer<typeof reviewSchema>;
// Tipo "de entrada" (antes da coerção do zod) — usado pelo useForm, já que o
// campo de nota chega como string do <select> antes de virar number.
export type ReviewFormValues = z.input<typeof reviewSchema>;

/** Avaliação de compra verificada, enviada pelo próprio cliente logado em "/conta" — sem `authorName`/`source` (vêm do `Customer`/da sessão, nunca do formulário). */
export const customerReviewSchema = z.object({
  productId: z.string().trim().min(1),
  rating: z.coerce.number().int("Nota inválida").min(1, "Mínimo 1 estrela").max(5, "Máximo 5 estrelas"),
  comment: z.string().trim().max(1000, "Máximo de 1000 caracteres").optional().or(z.literal("")),
});
export type CustomerReviewInput = z.infer<typeof customerReviewSchema>;
