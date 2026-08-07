import { randomBytes, createHash } from "crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { subdomainFromHost, isAppHost } from "@/modules/catalog/tenant-resolver";

/**
 * Sessão de cliente da loja pública — inteiramente separada da sessão NextAuth
 * de User/funcionário (`src/lib/auth.ts`). O cookie carrega só um token opaco;
 * o banco guarda apenas o hash SHA-256 dele (`CustomerSession.tokenHash`), pra
 * um vazamento do banco não virar sessão utilizável sozinho.
 */
const COOKIE_NAME = "eg_customer_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias

function generateToken() {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Path do cookie: "/" quando a loja é acessada pelo host dela de verdade
 * (subdomínio ou domínio próprio) — o proxy (`src/proxy.ts`) reescreve
 * `/loja/[subdomain]` só internamente, o navegador nunca vê esse prefixo na
 * URL, então um path restrito nunca bateria de volta. Só quando a loja é
 * acessada direto pelo host da aplicação (`/loja/[subdomain]/...` literal na
 * URL — ex.: ambiente sem subdomínio configurado) é que várias lojas dividem
 * o mesmo host, e aí o cookie precisa ficar restrito a essa loja para não
 * vazar sessão entre lojas diferentes no mesmo navegador.
 */
async function cookiePathForStore(subdomain: string) {
  const host = (await headers()).get("host");
  if (subdomainFromHost(host) === subdomain) return "/";
  const hostname = (host ?? "").split(":")[0].toLowerCase();
  if (!isAppHost(hostname)) return "/"; // domínio próprio, já resolvido pelo proxy
  return `/loja/${subdomain}`;
}

async function setSessionCookie(subdomain: string, token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS / 1000,
    path: await cookiePathForStore(subdomain),
  });
}

async function clearSessionCookie(subdomain: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: await cookiePathForStore(subdomain),
  });
}

async function readTokenFromCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}

/** Revoga exatamente a sessão do cookie atual (nunca em massa por customerId). */
async function revokeCurrentSession(tenantId: string) {
  const token = await readTokenFromCookie();
  if (!token) return;
  await prisma.customerSession.updateMany({
    where: { tokenHash: hashToken(token), tenantId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Cria uma sessão nova e já grava o cookie. Chamada sempre DEPOIS de qualquer
 * escrita que precise ter dado certo antes (pedido criado, login validado) —
 * nunca antes.
 */
export async function createCustomerSession(tenantId: string, subdomain: string, customerId: string) {
  const token = generateToken();
  await prisma.customerSession.create({
    data: {
      tenantId,
      customerId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  await setSessionCookie(subdomain, token);
}

/**
 * Revoga a sessão anterior do navegador (se houver) e cria uma sessão/token
 * novos — usada em todo login bem-sucedido (inclusive o da conta recém-criada
 * no checkout e a troca de conta), pra nunca reaproveitar token entre logins.
 */
export async function rotateCustomerSession(tenantId: string, subdomain: string, customerId: string) {
  await revokeCurrentSession(tenantId);
  await createCustomerSession(tenantId, subdomain, customerId);
}

export type ResolvedCustomerSession = {
  customerId: string;
  name: string;
  username: string;
};

/**
 * Sessão de cliente ativa para esta loja, ou `null` — nunca lança erro, pra
 * toda a UI poder simplesmente checar `null`. Só aceita a sessão se o
 * `tenantId` bater com a loja atual, não estiver revogada e não tiver
 * expirado.
 */
export async function getCustomerSession(tenantId: string): Promise<ResolvedCustomerSession | null> {
  const token = await readTokenFromCookie();
  if (!token) return null;

  const session = await prisma.customerSession.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      tenantId: true,
      expiresAt: true,
      revokedAt: true,
      customer: { select: { id: true, name: true, username: true } },
    },
  });
  if (!session) return null;
  if (session.tenantId !== tenantId) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (!session.customer.username) return null; // salvaguarda: sessão sem login associado

  await prisma.customerSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });

  return { customerId: session.customer.id, name: session.customer.name, username: session.customer.username };
}

/** Logout: revoga a sessão atual no servidor (não só o cookie) e limpa o cookie. */
export async function destroyCustomerSession(tenantId: string, subdomain: string) {
  await revokeCurrentSession(tenantId);
  await clearSessionCookie(subdomain);
}
