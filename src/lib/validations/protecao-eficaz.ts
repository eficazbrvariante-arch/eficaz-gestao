import { z } from "zod";

export const submitProtecaoEficazSchema = z.object({
  saleNumber: z.coerce.number().int().positive("Informe o número da venda (no cupom)."),
  proofPhotoUrl: z.string().trim().min(1, "Envie uma foto da nota."),
  termsAccepted: z.literal(true, {
    message: "Aceite os termos para continuar.",
  }),
});
export type SubmitProtecaoEficazInput = z.infer<typeof submitProtecaoEficazSchema>;
export type SubmitProtecaoEficazFormValues = z.input<typeof submitProtecaoEficazSchema>;

export const reviewProtecaoEficazSchema = z.object({
  registrationId: z.string().trim().min(1),
  rejectionReason: z.string().trim().optional().or(z.literal("")),
});
export type ReviewProtecaoEficazInput = z.infer<typeof reviewProtecaoEficazSchema>;
