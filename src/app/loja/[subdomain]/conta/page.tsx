import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getStoreBySubdomain } from "@/modules/catalog/tenant-resolver";
import { getCustomerSession } from "@/modules/customers/customer-session";
import { listCustomerOrders } from "@/modules/orders/order-service";
import { listReviewableProducts } from "@/modules/catalog/review-service";
import { getCustomerCreditBalance } from "@/modules/customers/customer-service";
import { listFiadoEntriesByCustomer, isFiadoOverdue } from "@/modules/fiado/fiado-service";
import { getCustomerConvenioBenefit } from "@/modules/convenios/convenio-customer-benefit";
import { listCustomerProtecaoEficaz } from "@/modules/protecao-eficaz/protecao-eficaz-service";
import { ORDER_STATUS_LABELS } from "@/modules/orders/order-status";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import { LogoutButton } from "./logout-button";
import { ReviewForm } from "./review-form";
import { ChangePasswordForm } from "./change-password-form";
import { ProtecaoEficazSection } from "./protecao-eficaz-form";
import { CreditoEficazSection } from "./credito-eficaz-section";
import {
  getCustomerCreditSummary,
  listCustomerApplications,
} from "@/modules/credito-eficaz/credito-eficaz-service";

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

  const [
    orders,
    reviewableProducts,
    creditBalance,
    fiadoEntries,
    convenioBenefit,
    protecaoEficazRegistrations,
    creditoEficazSummary,
    creditoEficazApplications,
  ] = await Promise.all([
    listCustomerOrders(store.id, session.customerId),
    listReviewableProducts(store.id, session.customerId),
    getCustomerCreditBalance(store.id, session.customerId),
    listFiadoEntriesByCustomer(store.id, session.customerId),
    getCustomerConvenioBenefit(session.customerId),
    listCustomerProtecaoEficaz(store.id, session.customerId),
    getCustomerCreditSummary(store.id, session.customerId),
    listCustomerApplications(store.id, session.customerId),
  ]);
  const pendingFiado = fiadoEntries.filter((entry) => entry.status === "PENDING");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Minha conta</h1>
          <p className="text-sm text-slate-500">@{session.username}</p>
        </div>
        <LogoutButton subdomain={subdomain} />
      </div>

      {convenioBenefit && (
        <div className="mb-8 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <h2 className="mb-1 text-sm font-semibold text-emerald-900">
            Convênio {convenioBenefit.convenioName}
          </h2>
          {!convenioBenefit.active ? (
            <p className="text-sm text-emerald-800">
              Seu cadastro no convênio não está ativo no momento — fale com a loja se achar que
              isso é um engano.
            </p>
          ) : convenioBenefit.vitrine.length === 0 ? (
            <p className="text-sm text-emerald-800">
              Você tem o desconto do convênio disponível no balcão da loja. Ainda não há produtos
              com desconto exclusivo no site.
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-emerald-800">
                Além do desconto no balcão da loja, você tem desconto exclusivo nestes produtos do
                site:
              </p>
              <ul className="space-y-2">
                {convenioBenefit.vitrine.map((item) => (
                  <li key={item.productId}>
                    <Link
                      href={`${base}/produto/${item.productId}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-white p-3 text-sm hover:bg-emerald-50/50"
                    >
                      <span className="text-slate-800">{item.name}</span>
                      <span className="shrink-0 text-right">
                        <span className="mr-1.5 text-xs text-slate-400 line-through">
                          {formatBRL(item.catalogPrice)}
                        </span>
                        <span className="font-semibold text-emerald-700">
                          {formatBRL(item.finalPrice)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <ProtecaoEficazSection subdomain={subdomain} registrations={protecaoEficazRegistrations} />

      <CreditoEficazSection
        subdomain={subdomain}
        summary={creditoEficazSummary}
        latestApplication={creditoEficazApplications[0] ?? null}
      />

      {(pendingFiado.length > 0 || creditBalance > 0) && (
        <div className="mb-8 rounded-xl border border-slate-200 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Fiado e crédito</h2>

          {creditBalance > 0 && (
            <p className="mb-3 text-sm font-medium text-emerald-700">
              Você tem {formatBRL(creditBalance)} em crédito de loja disponível.
            </p>
          )}

          {pendingFiado.length > 0 && (
            <ul className="space-y-2 text-sm">
              {pendingFiado.map((entry) => {
                const overdue = isFiadoOverdue(entry);
                return (
                  <li key={entry.id} className="flex justify-between gap-2">
                    <span className={overdue ? "font-medium text-red-600" : "text-slate-700"}>
                      {overdue ? "Vencido" : "A pagar"}
                      {entry.dueDate ? ` até ${formatDate(entry.dueDate)}` : ""}
                    </span>
                    <span className="shrink-0 font-medium text-slate-900">
                      {formatBRL(Number(entry.amount))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

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

      <details className="mt-8 border-t border-slate-200 pt-6">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">Alterar senha</summary>
        <div className="mt-4">
          <ChangePasswordForm subdomain={subdomain} />
        </div>
      </details>
    </div>
  );
}
