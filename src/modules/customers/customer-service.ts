import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { normalizeUsername } from "@/lib/validations/customer-auth";

/**
 * Custo do bcrypt para senha de cliente — deliberadamente maior que o custo 10
 * já usado para `User`/funcionário (`usuarios/actions.ts`, `(auth)/actions.ts`):
 * login de cliente é bem menos frequente que o de funcionário, o custo extra
 * é aceitável.
 */
const PASSWORD_COST = 12;

const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_USERNAME = 5;
const MAX_ATTEMPTS_PER_IP = 20;

export async function isUsernameAvailable(tenantId: string, usernameRaw: string): Promise<boolean> {
  const username = normalizeUsername(usernameRaw);
  const existing = await prisma.customer.findUnique({
    where: { tenantId_username: { tenantId, username } },
    select: { id: true },
  });
  return existing === null;
}

type RegisterCustomerData = {
  username: string;
  password: string;
  name: string;
  phone: string;
  email?: string | null;
  document?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZip?: string | null;
};

/**
 * Cria a conta dentro da MESMA transação que cria o pedido (`createOrder`) —
 * por isso recebe o client de transação explicitamente e nunca importa o
 * `prisma` global aqui dentro, pra não escapar do isolamento da transação.
 * Colisão de `username` (corrida rara — já checado por `isUsernameAvailable`
 * antes, mas não atomicamente) estoura `P2002`, deixado propagar para o
 * chamador tratar.
 */
export async function registerCustomer(
  tx: Prisma.TransactionClient,
  tenantId: string,
  data: RegisterCustomerData
) {
  const username = normalizeUsername(data.username);
  const passwordHash = await bcrypt.hash(data.password, PASSWORD_COST);

  return tx.customer.create({
    data: {
      tenantId,
      username,
      passwordHash,
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      document: data.document || null,
      addressStreet: data.addressStreet || null,
      addressNumber: data.addressNumber || null,
      addressCity: data.addressCity || null,
      addressState: data.addressState || null,
      addressZip: data.addressZip || null,
    },
    select: { id: true, name: true, username: true },
  });
}

export type AuthenticatedCustomer = { customerId: string; name: string; username: string };

/**
 * Login por `@usuário` + senha, com limite de tentativas por usuário e por
 * IP (`CustomerLoginAttempt`). Retorna `null` para QUALQUER falha — usuário
 * inexistente, senha errada ou limite excedido — sempre pelo mesmo caminho,
 * pra nunca revelar ao chamador (e por tabela, ao cliente) se o `@usuário`
 * existe ou não.
 */
export async function authenticateCustomer(
  tenantId: string,
  usernameRaw: string,
  password: string,
  ipAddress: string | null
): Promise<AuthenticatedCustomer | null> {
  const username = normalizeUsername(usernameRaw);
  const cutoff = new Date(Date.now() - LOGIN_ATTEMPT_WINDOW_MS);

  async function fail() {
    await prisma.customerLoginAttempt.create({ data: { tenantId, username, ipAddress } });
    return null;
  }

  const [attemptsByUsername, attemptsByIp] = await Promise.all([
    prisma.customerLoginAttempt.count({ where: { tenantId, username, createdAt: { gte: cutoff } } }),
    ipAddress
      ? prisma.customerLoginAttempt.count({ where: { tenantId, ipAddress, createdAt: { gte: cutoff } } })
      : Promise.resolve(0),
  ]);
  if (attemptsByUsername >= MAX_ATTEMPTS_PER_USERNAME || attemptsByIp >= MAX_ATTEMPTS_PER_IP) {
    return fail();
  }

  const customer = await prisma.customer.findUnique({
    where: { tenantId_username: { tenantId, username } },
    select: { id: true, name: true, username: true, passwordHash: true },
  });
  if (!customer || !customer.passwordHash) return fail();

  const matches = await bcrypt.compare(password, customer.passwordHash);
  if (!matches) return fail();

  await prisma.customer.update({ where: { id: customer.id }, data: { lastLoginAt: new Date() } });
  return { customerId: customer.id, name: customer.name, username: customer.username! };
}
