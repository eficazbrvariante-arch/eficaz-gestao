import { NextRequest, NextResponse } from "next/server";
import { getStoreBySubdomain, storeOrigin } from "@/modules/catalog/tenant-resolver";
import { getCatalogProduct } from "@/modules/catalog/catalog-service";
import { getCustomerSession } from "@/modules/customers/customer-session";
import { createWhatsappLeadOrder } from "@/modules/orders/order-service";
import { buildWhatsappLink } from "@/lib/whatsapp";
import { formatBRL } from "@/lib/format";

/**
 * Destino do botão "Comprar pelo WhatsApp" da página do produto — não abre o
 * WhatsApp direto (como fazia antes): sem visita ao servidor nesse clique, o
 * pedido nunca aparecia em "Pedidos online", só a mensagem avulsa no
 * WhatsApp da loja. Agora:
 * - Visitante sem conta é mandado pro cadastro rápido primeiro (`returnTo`
 *   traz de volta pra cá depois de criar a conta/logar).
 * - Visitante já logado tem um pedido pendente (`origin: WHATSAPP`) criado
 *   na hora, e só então é redirecionado pro WhatsApp — com o número do
 *   pedido já na mensagem.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ subdomain: string; id: string }> }
) {
  const { subdomain, id } = await params;
  const store = await getStoreBySubdomain(subdomain);
  const base = `/loja/${subdomain}`;
  const productPath = `${base}/produto/${id}`;
  if (!store) return NextResponse.redirect(new URL(base, request.url));

  const product = await getCatalogProduct(store.id, id);
  if (!product || !store.whatsapp) {
    return NextResponse.redirect(new URL(productPath, request.url));
  }

  const session = await getCustomerSession(store.id);
  if (!session) {
    const loginUrl = new URL(`${base}/conta/entrar`, request.url);
    loginUrl.searchParams.set("modo", "cadastro");
    loginUrl.searchParams.set("returnTo", `${productPath}/comprar-whatsapp`);
    loginUrl.searchParams.set("motivo", "comprar-whatsapp");
    return NextResponse.redirect(loginUrl);
  }

  const result = await createWhatsappLeadOrder(store.id, session.customerId, product.id);

  const price = product.promoPrice ?? Number(product.salePrice);
  const productUrl = `${storeOrigin(store)}${productPath}`;
  const orderLine = result.ok ? `\n\nPedido #${result.number}` : "";
  const message = `Olá! Tenho interesse neste produto:\n${product.name}\n${formatBRL(price)}\n${productUrl}${orderLine}`;

  return NextResponse.redirect(buildWhatsappLink(store.whatsapp, message));
}
