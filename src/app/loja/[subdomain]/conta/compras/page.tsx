import Link from "next/link";
import { requireCustomerAccountSession } from "../require-customer-account";
import { BackToAccountLink } from "../back-to-account-link";
import { ReviewForm } from "../review-form";
import { listCustomerOrders } from "@/modules/orders/order-service";
import { listReviewableProducts } from "@/modules/catalog/review-service";
import { ORDER_STATUS_LABELS } from "@/modules/orders/order-status";
import { formatBRL, formatDateTime } from "@/lib/format";

export default async function ComprasAccountPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const { store, session, base } = await requireCustomerAccountSession(
    subdomain,
    `/loja/${subdomain}/conta/compras`
  );

  const [orders, reviewableProducts] = await Promise.all([
    listCustomerOrders(store.id, session.customerId),
    listReviewableProducts(store.id, session.customerId),
  ]);

  return (
    <div>
      <BackToAccountLink base={base} />
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Minhas Compras</h1>

      {reviewableProducts.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Produtos para avaliar</h2>
          <div className="space-y-3">
            {reviewableProducts.map((product) => (
              <ReviewForm
                key={product.id}
                subdomain={subdomain}
                productId={product.id}
                productName={product.name}
                imageUrl={product.imageUrl}
                initialRating={product.myReview?.rating ?? 0}
                initialComment={product.myReview?.comment ?? ""}
              />
            ))}
          </div>
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold text-slate-900">Meus pedidos</h2>
      {orders.length === 0 ? (
        <p className="text-sm text-slate-500">Você ainda não fez nenhum pedido.</p>
      ) : (
        <ul className="space-y-2">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`${base}/pedido/${order.id}`}
                className="block rounded-md border border-slate-200 p-3 text-sm hover:bg-slate-50"
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-slate-900">Pedido #{order.number}</span>
                  <span className="shrink-0">{formatBRL(order.total)}</span>
                </div>
                <div className="mt-1 flex justify-between gap-2 text-xs text-slate-500">
                  <span>{ORDER_STATUS_LABELS[order.status]}</span>
                  <span className="shrink-0">{formatDateTime(order.createdAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
