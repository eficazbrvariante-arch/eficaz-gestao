import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trackEventSchema } from "@/lib/validations/analytics";
import { classifyDevice } from "@/modules/analytics/device-classifier";
import { classifyTrafficSource } from "@/modules/analytics/traffic-source";
import { getTodayFlashDeal } from "@/modules/catalog/flash-deal-service";

/**
 * Recebe eventos do funil de conversão da loja pública (`navigator.sendBeacon`,
 * ver `track-client.ts`). Nunca deve quebrar visivelmente a navegação do
 * visitante — qualquer falha aqui (payload inválido, loja não encontrada, erro
 * interno) responde 204 e só registra no log do servidor.
 *
 * Resolve o tenant pelo `subdomain` do corpo, não pelo header `Host`: uma loja
 * com domínio próprio não bate com `subdomainFromHost()` (que só remove o
 * sufixo do domínio raiz), e todo componente da loja já recebe `store.subdomain`
 * como prop, então isso não custa nada extra.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = trackEventSchema.safeParse(body);
    if (!parsed.success) {
      return new NextResponse(null, { status: 204 });
    }
    const input = parsed.data;

    const tenant = await prisma.tenant.findFirst({
      where: { subdomain: input.subdomain.toLowerCase(), catalogEnabled: true },
      select: { id: true },
    });
    if (!tenant) {
      return new NextResponse(null, { status: 204 });
    }

    const userAgent = request.headers.get("user-agent");
    const deviceType = classifyDevice(userAgent);
    const { source: trafficSource, host: referrerHost } = classifyTrafficSource(input.referrer);

    // Headers de geolocalização que a Vercel injeta na borda — disponíveis tanto
    // em Edge quanto em funções Node normais, sem serviço externo de GeoIP.
    // Localmente (fora da Vercel) ficam ausentes, o que é esperado.
    const geoCity = request.headers.get("x-vercel-ip-city");
    const geoState = request.headers.get("x-vercel-ip-country-region");
    const geoCountry = request.headers.get("x-vercel-ip-country");

    const isPageView = input.type === "PAGE_VIEW";
    await prisma.visitorSession.upsert({
      where: { id: input.sessionId },
      create: {
        id: input.sessionId,
        tenantId: tenant.id,
        visitorId: input.visitorId,
        deviceType,
        trafficSource,
        referrerHost,
        geoCity: geoCity ? decodeURIComponent(geoCity) : null,
        geoState: geoState ? decodeURIComponent(geoState) : null,
        geoCountry,
        userAgent,
        pageViewCount: isPageView ? 1 : 0,
      },
      update: {
        lastSeenAt: new Date(),
        ...(isPageView && { pageViewCount: { increment: 1 } }),
      },
    });

    // Heartbeat só atualiza a sessão (mantém "online agora" correto) — não gera
    // linha de evento, pra uma aba parada não virar ruído na tabela de eventos.
    if (input.type === "HEARTBEAT") {
      return new NextResponse(null, { status: 204 });
    }

    // Se o produto do evento é a Oferta Relâmpago de hoje — calculado no
    // servidor, nunca confiado do payload do cliente.
    let isFlashDeal = input.type === "FLASH_VIEW" || input.type === "FLASH_CLICK";
    if (!isFlashDeal && input.productId) {
      const todayDeal = await getTodayFlashDeal(tenant.id);
      isFlashDeal = todayDeal?.productId === input.productId;
    }

    await prisma.analyticsEvent.create({
      data: {
        tenantId: tenant.id,
        sessionId: input.sessionId,
        type: input.type,
        path: input.path,
        productId: input.productId,
        orderId: input.orderId,
        isFlashDeal,
      },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[track] falha ao registrar evento", error);
    return new NextResponse(null, { status: 204 });
  }
}
