import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Domínio raiz onde os subdomínios das lojas são servidos.
 * Em produção vira `eficazgestao.com.br`; em desenvolvimento, `localhost`.
 */
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost";

/**
 * Extrai o subdomínio da loja a partir do host da requisição.
 *
 * Retorna `null` quando o host é o próprio domínio raiz (onde fica o painel
 * administrativo) ou quando não há subdomínio — nesses casos o catálogo é
 * acessado pelo caminho `/loja/[subdominio]`.
 */
/**
 * O host é o domínio da própria aplicação (painel administrativo, ou uma loja
 * acessada direto por `/loja/[subdomain]` sem subdomínio configurado)?
 * Domínios próprios das lojas são qualquer outra coisa. Mesma checagem que o
 * proxy usa para decidir se reescreve para domínio próprio, reaproveitada
 * também pela sessão de cliente (`customer-session.ts`) para escopar o
 * cookie corretamente.
 */
export function isAppHost(hostname: string): boolean {
  return (
    hostname === ROOT_DOMAIN ||
    hostname === `www.${ROOT_DOMAIN}` ||
    hostname.endsWith(`.${ROOT_DOMAIN}`) ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".vercel.app")
  );
}

export function subdomainFromHost(host: string | null): string | null {
  if (!host) return null;

  const hostname = host.split(":")[0].toLowerCase();
  if (hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}`) return null;

  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    const sub = hostname.slice(0, -(ROOT_DOMAIN.length + 1));
    // `www` não é uma loja, e subdomínios compostos não são suportados.
    if (!sub || sub === "www" || sub.includes(".")) return null;
    return sub;
  }

  return null;
}

/**
 * Carrega a loja pública pelo subdomínio. Só retorna empresas com o catálogo
 * ativo — o `cache` do React evita recarregar dentro da mesma renderização.
 */
export const getStoreBySubdomain = cache(async (subdomain: string) => {
  return prisma.tenant.findFirst({
    where: { subdomain: subdomain.toLowerCase(), catalogEnabled: true },
    select: {
      id: true,
      name: true,
      tradeName: true,
      subdomain: true,
      customDomain: true,
      domainStatus: true,
      logoUrl: true,
      primaryColor: true,
      phone: true,
      whatsapp: true,
      addressStreet: true,
      addressNumber: true,
      addressCity: true,
      addressState: true,
      bannerUrl: true,
      bannerTitle: true,
      bannerSubtitle: true,
      deliveryEnabled: true,
      pickupEnabled: true,
      instagramUrl: true,
      aboutText: true,
      exchangePolicy: true,
      warrantyPolicy: true,
      privacyPolicy: true,
      businessHours: true,
      acceptedPaymentMethods: true,
      maxInstallments: true,
      minInstallmentValue: true,
    },
  });
});

export type Store = NonNullable<Awaited<ReturnType<typeof getStoreBySubdomain>>>;

/** Recorte de `Store` que os cards de produto precisam para Pix/parcelamento/badges, já convertido de Decimal para number. */
export function storeCommerceInfo(store: Store) {
  return {
    deliveryEnabled: store.deliveryEnabled,
    acceptedPaymentMethods: store.acceptedPaymentMethods as string[],
    maxInstallments: store.maxInstallments,
    minInstallmentValue: store.minInstallmentValue ? Number(store.minInstallmentValue) : null,
  };
}

/** Nome de exibição da loja: prefere o nome fantasia. */
export function storeDisplayName(store: Pick<Store, "name" | "tradeName">) {
  return store.tradeName?.trim() || store.name;
}

/** "Cidade-UF" da loja, ou só a cidade se o estado não estiver cadastrado. */
export function storeCityLabel(store: Pick<Store, "addressCity" | "addressState">) {
  if (!store.addressCity) return null;
  return store.addressState ? `${store.addressCity}-${store.addressState}` : store.addressCity;
}

/**
 * URL pública absoluta da loja (domínio próprio verificado, senão o host
 * público da plataforma) — usada em links enviados fora do navegador (ex.:
 * mensagem de WhatsApp, e-mail de redefinição de senha), onde uma URL
 * relativa não funciona.
 *
 * Sem `NEXT_PUBLIC_STORE_HOST`, cai no formato antigo `subdomínio.ROOT_DOMAIN`
 * — mas em produção isso está quebrado: não existe DNS coringa para
 * `*.ROOT_DOMAIN`, e `ROOT_DOMAIN` lá vale `app.eficazbr.com.br` (precisa
 * continuar assim, senão o proxy passa a ler `app.eficazbr.com.br` como se
 * fosse a loja de subdomínio "app" e derruba o painel). O host público real
 * da vitrine (`www.eficazbr.com.br`, sempre com `/loja/[subdominio]` no
 * caminho — path já incluído pelos chamadores) fica em `NEXT_PUBLIC_STORE_HOST`.
 */
export function storeOrigin(store: Pick<Store, "subdomain" | "customDomain" | "domainStatus">) {
  const storeHost = process.env.NEXT_PUBLIC_STORE_HOST;
  const host =
    store.customDomain && store.domainStatus === "ACTIVE"
      ? store.customDomain
      : (storeHost ?? `${store.subdomain}.${ROOT_DOMAIN}`);
  const protocol = host === "localhost" || host.endsWith(".localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

/**
 * Texto do site pra exibir impresso (ex.: cupom da venda) — sempre com
 * "www." na frente, mesmo quando o domínio próprio foi cadastrado sem (ver
 * `normalizeDomain`, que remove o "www." do valor salvo). Sem protocolo,
 * porque não faz sentido lido no papel.
 */
export function storeDisplayHost(store: Pick<Store, "subdomain" | "customDomain" | "domainStatus">) {
  const host = storeOrigin(store).replace(/^https?:\/\//, "");
  return host.startsWith("www.") ? host : `www.${host}`;
}

/**
 * Busca a empresa por domínio customizado (usado pelo proxy para reescrever a rota).
 * O fluxo completo de cadastro e validação de domínio entra na Fase 7.
 */
export async function getStoreByCustomDomain(hostname: string) {
  return prisma.tenant.findFirst({
    where: { customDomain: hostname.toLowerCase(), catalogEnabled: true },
    select: { subdomain: true },
  });
}

/** Uma linha do horário de atendimento, guardada em `Tenant.businessHours` (Json). */
export type BusinessHourEntry = {
  /** 0 = domingo … 6 = sábado, mesma convenção de `Date#getDay()`. */
  day: number;
  opensAt: string;
  closesAt: string;
  closed: boolean;
};

export function parseBusinessHours(value: unknown): BusinessHourEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is BusinessHourEntry => {
    if (typeof entry !== "object" || entry === null) return false;
    const e = entry as Record<string, unknown>;
    return (
      typeof e.day === "number" &&
      e.day >= 0 &&
      e.day <= 6 &&
      typeof e.closed === "boolean" &&
      typeof e.opensAt === "string" &&
      typeof e.closesAt === "string"
    );
  });
}

const STORE_TIMEZONE = "America/Sao_Paulo";
const weekdayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: STORE_TIMEZONE, weekday: "short" });
const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: STORE_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Dia da semana "de hoje" no fuso da loja (0 = domingo … 6 = sábado, convenção de `Date#getDay()`). */
export function todayWeekday(now = new Date()): number {
  return WEEKDAY_INDEX[weekdayFormatter.format(now)];
}

/**
 * Se a loja está aberta agora, a partir do horário configurado em
 * `businessHours` e do fuso da loja. Retorna `null` quando não há horário
 * configurado — nesse caso o indicador "Aberto agora" simplesmente não aparece.
 */
export function isStoreOpenNow(
  store: Pick<Store, "businessHours">
): { open: boolean; today: BusinessHourEntry | null } | null {
  const hours = parseBusinessHours(store.businessHours);
  if (hours.length === 0) return null;

  const now = new Date();
  const day = todayWeekday(now);
  const currentTime = timeFormatter.format(now);

  const today = hours.find((h) => h.day === day) ?? null;
  if (!today || today.closed) return { open: false, today };

  const open = currentTime >= today.opensAt && currentTime <= today.closesAt;
  return { open, today };
}
