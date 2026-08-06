import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getStoreBySubdomain,
  storeCityLabel,
  storeDisplayName,
} from "@/modules/catalog/tenant-resolver";
import { listCatalogCategories } from "@/modules/catalog/catalog-service";
import { getTodayFlashDeal } from "@/modules/catalog/flash-deal-service";
import { CartProvider } from "@/modules/catalog/cart-context";
import { StoreHeader } from "./store-header";
import { StoreFooter } from "./store-footer";
import { WhatsappFloatingButton } from "./whatsapp-floating-button";
import { FlashSalePopup } from "./flash-sale-popup";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}): Promise<Metadata> {
  const { subdomain } = await params;
  const store = await getStoreBySubdomain(subdomain);
  if (!store) return { title: "Loja não encontrada" };

  const name = storeDisplayName(store);
  return {
    title: `${name} — Catálogo online`,
    description: `Confira os produtos disponíveis na ${name}.`,
  };
}

export default async function StoreLayout({
  params,
  children,
}: {
  params: Promise<{ subdomain: string }>;
  children: React.ReactNode;
}) {
  const { subdomain } = await params;
  const store = await getStoreBySubdomain(subdomain);
  if (!store) notFound();

  // Mesma consulta usada na grade de categorias e no filtro de /produtos —
  // já exclui categorias exclusivas de balcão (`Category.counterOnly`).
  const [categories, flashDeal] = await Promise.all([
    listCatalogCategories(store.id),
    getTodayFlashDeal(store.id),
  ]);

  // A cor da empresa entra como variável CSS para os componentes da loja usarem
  // sem precisar receber a cor por prop em cada nível.
  const themeStyle = store.primaryColor
    ? ({ "--store-primary": store.primaryColor } as React.CSSProperties)
    : undefined;

  return (
    <CartProvider
      subdomain={store.subdomain}
      flashDeal={
        flashDeal ? { productId: flashDeal.productId, orderLimit: flashDeal.orderLimit } : null
      }
    >
      <div
        style={themeStyle}
        className="flex min-h-screen flex-col bg-white [--store-primary:#0f172a]"
      >
        <StoreHeader store={store} categories={categories} />
        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
        <StoreFooter store={store} />
        {store.whatsapp && (
          <WhatsappFloatingButton whatsapp={store.whatsapp} instagramUrl={store.instagramUrl} />
        )}
        {flashDeal && (
          <FlashSalePopup
            subdomain={store.subdomain}
            base={`/loja/${store.subdomain}`}
            deal={flashDeal}
            trust={{
              cityLabel: storeCityLabel(store),
              deliveryEnabled: store.deliveryEnabled,
              hasWarranty: Boolean(store.warrantyPolicy),
              storeName: storeDisplayName(store),
            }}
          />
        )}
      </div>
    </CartProvider>
  );
}
