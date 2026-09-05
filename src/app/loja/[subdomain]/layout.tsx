import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import {
  getStoreBySubdomain,
  storeCityLabel,
  storeDisplayName,
} from "@/modules/catalog/tenant-resolver";
import { listCatalogCategories, groupCategoriesByParent } from "@/modules/catalog/catalog-service";
import { getTodayFlashDeal } from "@/modules/catalog/flash-deal-service";
import { CartProvider } from "@/modules/catalog/cart-context";
import { normalizeHexColor } from "@/modules/pwa/store-icon";
import { StoreHeader } from "./store-header";
import { StoreFooter } from "./store-footer";
import { WhatsappFloatingButton } from "./whatsapp-floating-button";
import { FlashSalePopup } from "./flash-sale-popup";
import { StoreTracker } from "./store-tracker";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}): Promise<Metadata> {
  const { subdomain } = await params;
  const store = await getStoreBySubdomain(subdomain);
  if (!store) return { title: "Loja não encontrada" };

  const name = storeDisplayName(store);
  const description = `Confira os produtos disponíveis na ${name}.`;
  const base = `/loja/${store.subdomain}`;
  return {
    title: `${name} — Catálogo online`,
    description,
    openGraph: {
      title: name,
      description,
      images: store.logoUrl ? [{ url: store.logoUrl }] : undefined,
    },
    // Caminho absoluto: o manifest e os ícones respondem no mesmo lugar tanto
    // no host compartilhado quanto num domínio próprio (o proxy reescreve para
    // cá de qualquer forma).
    manifest: `${base}/manifest.webmanifest`,
    icons: {
      apple: `${base}/icones/apple-touch-180.png`,
    },
    appleWebApp: {
      capable: true,
      title: name,
      // `default` mantém a barra de status opaca e o conteúdo abaixo dela. O
      // `black-translucent` empurraria o cabeçalho da loja para debaixo do
      // relógio do iPhone — exigiria tratar `safe-area-inset` em todas as
      // telas para não cortar nada, o que não vale o ganho estético aqui.
      statusBarStyle: "default",
    },
  };
}

/**
 * Cor da barra do navegador/app instalado: a cor da própria loja, a mesma que
 * o manifest declara em `theme_color`.
 */
export async function generateViewport({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}): Promise<Viewport> {
  const { subdomain } = await params;
  const store = await getStoreBySubdomain(subdomain);
  return { themeColor: normalizeHexColor(store?.primaryColor) ?? "#0f172a" };
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
  const categoryGroups = groupCategoriesByParent(categories);

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
        <StoreTracker subdomain={store.subdomain} />
        <StoreHeader store={store} categoryGroups={categoryGroups} />
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
