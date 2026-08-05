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
