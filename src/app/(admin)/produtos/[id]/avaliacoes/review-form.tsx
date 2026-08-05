"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { reviewSchema, type ReviewInput, type ReviewFormValues } from "@/lib/validations/review";
import { createReviewAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";

export function ReviewForm({ productId }: { productId: string }) {
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReviewFormValues, unknown, ReviewInput>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { rating: 5 },
  });

  const onSubmit = (data: ReviewInput) => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await createReviewAction(productId, data);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({ type: "success", message: result?.success ?? "Avaliação lançada." });
        reset({ authorName: "", rating: 5, comment: "", source: "" });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="mb-4">
        <Label htmlFor="authorName">Nome de quem avaliou</Label>
        <Input id="authorName" {...register("authorName")} />
        <FieldError message={errors.authorName?.message} />
      </div>

      <div className="mb-4">
        <Label htmlFor="rating">Nota</Label>
        <Select id="rating" {...register("rating")}>
          <option value={5}>5 — excelente</option>
          <option value={4}>4 — bom</option>
          <option value={3}>3 — regular</option>
          <option value={2}>2 — ruim</option>
          <option value={1}>1 — péssimo</option>
        </Select>
        <FieldError message={errors.rating?.message} />
      </div>

      <div className="mb-4">
        <Label htmlFor="source">Origem (opcional)</Label>
        <Input id="source" placeholder="WhatsApp, Google, loja física..." {...register("source")} />
        <FieldError message={errors.source?.message} />
      </div>

      <div className="mb-6">
        <Label htmlFor="comment">Comentário (opcional)</Label>
        <Textarea id="comment" rows={3} {...register("comment")} />
        <FieldError message={errors.comment?.message} />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Salvando..." : "Lançar avaliação"}
      </Button>
    </form>
  );
}
