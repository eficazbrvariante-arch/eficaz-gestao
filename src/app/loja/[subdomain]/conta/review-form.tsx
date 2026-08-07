"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { submitReviewAction } from "./actions";
import { StarIcon } from "../icons";

export function ReviewForm({
  subdomain,
  productId,
  productName,
  imageUrl,
  initialRating,
  initialComment,
}: {
  subdomain: string;
  productId: string;
  productName: string;
  imageUrl: string | null;
  initialRating: number;
  initialComment: string;
}) {
  const [rating, setRating] = useState(initialRating);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState(initialComment);
  const [feedback, setFeedback] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const displayed = hoverRating || rating;
  const alreadyReviewed = initialRating > 0;

  function handleSubmit() {
    if (rating < 1) {
      setFeedback("Escolha de 1 a 5 estrelas.");
      return;
    }
    setFeedback(undefined);
    startTransition(async () => {
      const result = await submitReviewAction(subdomain, { productId, rating, comment });
      setFeedback(result.error ?? "Avaliação enviada. Obrigado!");
    });
  }

  return (
    <div className="flex gap-3 rounded-xl border border-slate-200 p-4">
      {imageUrl && (
        <Image
          src={imageUrl}
          alt={productName}
          width={56}
          height={56}
          className="h-14 w-14 shrink-0 rounded-md object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{productName}</p>

        <div className="mt-1 flex gap-0.5" onMouseLeave={() => setHoverRating(0)}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`${value} estrela${value === 1 ? "" : "s"}`}
              onMouseEnter={() => setHoverRating(value)}
              onClick={() => setRating(value)}
              className="text-amber-400"
            >
              <StarIcon className="h-5 w-5" filled={value <= displayed} />
            </button>
          ))}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder="Conte como foi (opcional)"
          className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />

        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:bg-slate-400"
            style={isPending ? undefined : { backgroundColor: "var(--store-primary)" }}
          >
            {isPending ? "Enviando..." : alreadyReviewed ? "Atualizar avaliação" : "Enviar avaliação"}
          </button>
          {feedback && <p className="text-xs text-slate-500">{feedback}</p>}
        </div>
      </div>
    </div>
  );
}
