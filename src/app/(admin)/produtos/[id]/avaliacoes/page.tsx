import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { ReviewForm } from "./review-form";
import { deleteReviewAction } from "./actions";

export default async function ProductReviewsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const product = await prisma.product.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, name: true, avgRating: true, reviewCount: true },
  });
  if (!product) notFound();

  const reviews = await prisma.productReview.findMany({
    where: { productId: id, tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <Link href="/produtos" className="text-sm text-text-muted hover:underline">
        ← Produtos
      </Link>
      <h1 className="mt-2 mb-1 text-xl font-semibold text-foreground">
        Avaliações — {product.name}
      </h1>
      <p className="mb-6 text-sm text-text-muted">
        {product.reviewCount > 0
          ? `Média ${Number(product.avgRating).toFixed(1)} de 5 · ${product.reviewCount} avaliação${
              product.reviewCount === 1 ? "" : "ões"
            }`
          : "Nenhuma avaliação lançada ainda — o card do produto só mostra estrelas quando houver ao menos uma."}
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Lançar avaliação real</h2>
            <p className="mb-4 text-xs text-slate-500">
              Use para registrar uma avaliação recebida de fora da plataforma (WhatsApp, Google,
              na loja...). Avaliações de clientes que compraram pelo catálogo aparecem aqui
              automaticamente, lançadas por eles em &quot;Minha conta&quot;.
            </p>
            <ReviewForm productId={product.id} />
          </div>
        </div>

        <div className="space-y-3 lg:col-span-2">
          {reviews.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
              Nenhuma avaliação lançada ainda.
            </div>
          ) : (
            reviews.map((review) => (
              <div key={review.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{review.authorName}</p>
                    <p className="text-xs text-slate-400">
                      {"★".repeat(review.rating)}
                      {"☆".repeat(5 - review.rating)}
                      {review.source ? ` · ${review.source}` : ""} · {formatDateTime(review.createdAt)}
                    </p>
                  </div>
                  <form action={deleteReviewAction.bind(null, product.id, review.id)}>
                    <button
                      type="submit"
                      className="shrink-0 text-xs text-red-600 hover:underline"
                    >
                      Excluir
                    </button>
                  </form>
                </div>
                {review.comment && (
                  <p className="mt-2 text-sm text-slate-600">{review.comment}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
