import { notFound } from "next/navigation";
import { getStoreBySubdomain, storeCityLabel } from "@/modules/catalog/tenant-resolver";
import { CartView } from "./cart-view";

export default async function StoreCartPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const store = await getStoreBySubdomain(subdomain);
  if (!store) notFound();

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Seu carrinho</h1>
      <CartView base={`/loja/${store.subdomain}`} city={storeCityLabel(store)} />
    </div>
  );
}
