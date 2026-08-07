import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getStoreBySubdomain } from "@/modules/catalog/tenant-resolver";
import { getCustomerSession } from "@/modules/customers/customer-session";
import { listCustomerOrders } from "@/modules/orders/order-service";
import { listReviewableProducts } from "@/modules/catalog/review-service";
import { ORDER_STATUS_LABELS } from "@/modules/orders/order-status";
import { formatBRL, formatDateTime } from "@/lib/format";
import { LogoutButton } from "./logout-button";
import { ReviewForm } from "./review-form";

export default async function CustomerAccountPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const store = await getStoreBySubdomain(subdomain);
  if (!store) notFound();

  const base = `/loja/${subdomain}`;
  const session = await getCustomerSession(store.id);
  if (!session) {
    redirect(`${base}/conta/entrar?returnTo=${encodeURIComponent(`${base}/conta`)}`);
  }

  const [orders, reviewableProducts] = await Promise.all([
    listCustomerOrders(store.id, session.customerId),
    listReviewableProducts(store.id, session.customerId),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Minha conta</h1>
          <p className="text-sm text-slate-500">@{session.username}</p>
        </div>
        <LogoutButton subdomain={subdomain} />
      </div>

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
