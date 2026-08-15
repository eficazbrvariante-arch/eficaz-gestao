import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { normalizeUsername } from "@/lib/validations/customer-auth";
import { generateResetToken, hashToken } from "@/lib/tokens";
import { revokeAllCustomerSessions } from "@/modules/customers/customer-session";

/** Mesmo TTL do reset de senha do funcionário (`(auth)/actions.ts`). */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

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

/** Saldo de crédito de loja do cliente — usado na própria "Minha conta" da loja online. */
export async function getCustomerCreditBalance(tenantId: string, customerId: string): Promise<number> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
    select: { creditBalance: true },
  });
  return customer ? Number(customer.creditBalance) : 0;
}

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
  /** `YYYY-MM-DD`, mesmo formato do `<input type="date">` do formulário. */
  birthDate?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZip?: string | null;
  /** Preenchido só quando a conta nasce junto com um cadastro de convênio (ver `submitConvenioSignupAction`). */
  convenioMemberId?: string | null;
};

/** `YYYY-MM-DD` (fuso de Brasília) para `Date`, ao meio-dia para não escorregar de dia — mesma regra do cadastro feito pelo painel (`(admin)/clientes/actions.ts`). */
function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  return new Date(`${value}T12:00:00-03:00`);
}

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
      birthDate: parseDateOnly(data.birthDate),
      addressStreet: data.addressStreet || null,
      addressNumber: data.addressNumber || null,
      addressCity: data.addressCity || null,
      addressState: data.addressState || null,
      addressZip: data.addressZip || null,
      convenioMemberId: data.convenioMemberId || null,
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

/**
 * Gera o token de recuperação (mesmo padrão de `User.resetToken`: hash SHA-256
 * no banco, valor em claro só no e-mail) e devolve os dados pro chamador
 * montar o link e enviar — este módulo não manda e-mail, só resolve dados.
 * `null` quando não existe conta com login para esse e-mail nesta loja
 * (cadastro manual do lojista, sem `passwordHash`, não conta) — o chamador
 * ainda assim devolve a mesma mensagem genérica de sempre, pra não revelar
 * se o e-mail existe.
 */
export async function requestCustomerPasswordReset(
  tenantId: string,
  emailRaw: string
): Promise<{ rawToken: string; name: string; email: string } | null> {
  const email = emailRaw.trim().toLowerCase();
  const customer = await prisma.customer.findFirst({
    where: { tenantId, email, passwordHash: { not: null } },
    select: { id: true, name: true, email: true },
  });
  if (!customer || !customer.email) return null;

  const { rawToken, hashedToken } = generateResetToken();
  await prisma.customer.update({
    where: { id: customer.id },
    data: { resetToken: hashedToken, resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  return { rawToken, name: customer.name, email: customer.email };
}

/** Senha temporária legível para o lojista repassar por telefone/WhatsApp. */
export function generateRandomPassword(): string {
  return randomBytes(9).toString("base64url");
}

export type AdminSetCustomerPasswordResult = { ok: true } | { ok: false; error: string };

/**
 * Redefinição de senha pelo lojista (ficha do cliente no admin) — para
 * quando o cliente perdeu acesso e liga pedindo ajuda. Diferente de
 * `changeCustomerPassword` (cliente logado trocando a própria senha) e de
 * `resetCustomerPassword` (token por e-mail): aqui a autorização é a sessão
 * do funcionário no admin, checada pelo chamador (`requireUser`) — este
 * módulo só confere que o cliente pertence ao tenant e tem login habilitado.
 */
export async function adminSetCustomerPassword(
  tenantId: string,
  customerId: string,
  newPassword: string
): Promise<AdminSetCustomerPasswordResult> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
    select: { username: true },
  });
  if (!customer) return { ok: false, error: "Cliente não encontrado." };
  if (!customer.username) {
    return { ok: false, error: "Este cliente não tem login na loja online." };
  }

  const passwordHash = await bcrypt.hash(newPassword, PASSWORD_COST);
  await prisma.customer.update({ where: { id: customerId }, data: { passwordHash } });
  await revokeAllCustomerSessions(customerId);

  return { ok: true };
}

export type ChangeCustomerPasswordResult = { ok: true } | { ok: false; error: string };

/**
 * Troca de senha pelo próprio cliente logado (dentro de "Minha conta"),
 * diferente de `resetCustomerPassword` (via token de e-mail, sem sessão).
 * Exige a senha atual mesmo já autenticado — o cookie prova que é o mesmo
 * navegador, não que é a mesma pessoa (ex.: sessão esquecida aberta em
 * computador compartilhado). Revoga toda sessão existente (inclusive a
 * atual): quem chamou é responsável por abrir uma sessão nova depois.
 */
export async function changeCustomerPassword(
  tenantId: string,
  customerId: string,
  currentPassword: string,
  newPassword: string
): Promise<ChangeCustomerPasswordResult> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
    select: { passwordHash: true },
  });
  if (!customer || !customer.passwordHash) {
    return { ok: false, error: "Não foi possível identificar sua conta." };
  }

  const matches = await bcrypt.compare(currentPassword, customer.passwordHash);
  if (!matches) return { ok: false, error: "Senha atual incorreta." };

  const passwordHash = await bcrypt.hash(newPassword, PASSWORD_COST);
  await prisma.customer.update({ where: { id: customerId }, data: { passwordHash } });
  await revokeAllCustomerSessions(customerId);

  return { ok: true };
}

export type ResetCustomerPasswordResult = { ok: true } | { ok: false; error: string };

/**
 * Troca a senha a partir do token recebido por e-mail. Revoga toda sessão
 * ativa da conta na sequência — se alguém tinha acesso indevido (sessão
 * roubada), a troca de senha derruba esse acesso também, não só a senha antiga.
 */
export async function resetCustomerPassword(
  tenantId: string,
  token: string,
  newPassword: string
): Promise<ResetCustomerPasswordResult> {
  const hashedToken = hashToken(token);
  const customer = await prisma.customer.findFirst({
    where: { tenantId, resetToken: hashedToken },
    select: { id: true, resetTokenExpiresAt: true },
  });

  if (!customer || !customer.resetTokenExpiresAt || customer.resetTokenExpiresAt < new Date()) {
    return { ok: false, error: "Link de redefinição inválido ou expirado. Solicite um novo." };
  }

  const passwordHash = await bcrypt.hash(newPassword, PASSWORD_COST);
  await prisma.customer.update({
    where: { id: customer.id },
    data: { passwordHash, resetToken: null, resetTokenExpiresAt: null },
  });

  await revokeAllCustomerSessions(customer.id);

  return { ok: true };
}

export type GrantStoreCreditResult = { ok: true } | { ok: false; error: string };

/**
 * Concede crédito de loja manualmente (ex.: crédito positivo de um fiado
 * quitado a maior, cortesia). Reaproveita o mesmo saldo/extrato/forma de
 * pagamento (`STORE_CREDIT`) já usado pelo crédito gerado por cancelamento —
 * só ADMIN pode chamar isso (ver `canManageFiado`), verificado por quem chama.
 */
export async function grantManualStoreCredit(
  tenantId: string,
  customerId: string,
  amount: number,
  reason: string,
  grantedByUserId: string
): Promise<GrantStoreCreditResult> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
    select: { id: true },
  });
  if (!customer) return { ok: false, error: "Cliente não encontrado." };

  await prisma.$transaction([
    prisma.customer.update({
      where: { id: customerId },
      data: { creditBalance: { increment: amount } },
    }),
    prisma.customerCreditMovement.create({
      data: {
        tenantId,
        customerId,
        type: "GRANTED",
        amount,
        userId: grantedByUserId,
        reason,
      },
    }),
  ]);

  return { ok: true };
}

export type MergeCustomersResult =
  | {
      ok: true;
      keptName: string;
      mergedName: string;
      creditTransferred: number;
      loginTransferred: boolean;
    }
  | { ok: false; error: string };

/**
 * Mesclagem de dois cadastros duplicados do mesmo cliente (ex.: um criado
 * manualmente no PDV, outro pelo próprio cliente no catálogo online — não
 * existe hoje vínculo automático entre os dois por telefone/e-mail/documento,
 * de propósito, para não abrir brecha de account takeover num cadastro
 * antigo; ver `registerCustomer`/`createOrder`). `keepId` é quem permanece —
 * absorve tudo de `mergeId`, que é apagado ao final. Irreversível.
 */
export async function mergeCustomers(
  tenantId: string,
  keepId: string,
  mergeId: string
): Promise<MergeCustomersResult> {
  if (keepId === mergeId) {
    return { ok: false, error: "Selecione dois cadastros diferentes para mesclar." };
  }

  const [keep, merge] = await Promise.all([
    prisma.customer.findFirst({ where: { id: keepId, tenantId } }),
    prisma.customer.findFirst({ where: { id: mergeId, tenantId } }),
  ]);
  if (!keep || !merge) return { ok: false, error: "Cliente não encontrado." };

  if (keep.username && merge.username) {
    return {
      ok: false,
      error:
        "Os dois cadastros têm login próprio na loja online — não dá pra mesclar automaticamente. Remova o login de um deles antes.",
    };
  }

  const creditTransferred = Number(merge.creditBalance);
  const loginTransferred = !keep.username && merge.username !== null;

  try {
    await prisma.$transaction(async (tx) => {
      // Avaliação do produto é única por (loja, produto, cliente) — se os
      // dois cadastros avaliaram o mesmo produto, a do absorvido não pode
      // ser reatribuída (violaria a constraint), então é descartada.
      const [keepReviews, mergeReviews] = await Promise.all([
        tx.productReview.findMany({ where: { customerId: keepId }, select: { productId: true } }),
        tx.productReview.findMany({ where: { customerId: mergeId }, select: { id: true, productId: true } }),
      ]);
      const keptProductIds = new Set(keepReviews.map((r) => r.productId));
      const conflictingReviewIds = mergeReviews
        .filter((r) => keptProductIds.has(r.productId))
        .map((r) => r.id);
      if (conflictingReviewIds.length > 0) {
        await tx.productReview.deleteMany({ where: { id: { in: conflictingReviewIds } } });
      }

      await tx.productReview.updateMany({ where: { customerId: mergeId }, data: { customerId: keepId } });
      await tx.sale.updateMany({ where: { customerId: mergeId }, data: { customerId: keepId } });
      await tx.order.updateMany({ where: { customerId: mergeId }, data: { customerId: keepId } });
      await tx.fiadoEntry.updateMany({ where: { customerId: mergeId }, data: { customerId: keepId } });
      await tx.customerCreditMovement.updateMany({
        where: { customerId: mergeId },
        data: { customerId: keepId },
      });
      await tx.repairOrder.updateMany({ where: { customerId: mergeId }, data: { customerId: keepId } });
      await tx.whatsAppContact.updateMany({ where: { customerId: mergeId }, data: { customerId: keepId } });
      await tx.customerSession.updateMany({ where: { customerId: mergeId }, data: { customerId: keepId } });

      const keepLastPurchase = keep.lastPurchaseAt;
      const mergeLastPurchase = merge.lastPurchaseAt;
      const lastPurchaseAt =
        !keepLastPurchase || (mergeLastPurchase && mergeLastPurchase > keepLastPurchase)
          ? mergeLastPurchase
          : keepLastPurchase;

      await tx.customer.update({
        where: { id: keepId },
        data: {
          creditBalance: { increment: creditTransferred },
          totalSpent: { increment: merge.totalSpent },
          lastPurchaseAt,
          ...(loginTransferred
            ? {
                username: merge.username,
                passwordHash: merge.passwordHash,
                lastLoginAt: merge.lastLoginAt,
              }
            : {}),
        },
      });

      await tx.customer.delete({ where: { id: mergeId } });
    });

    return { ok: true, keptName: keep.name, mergedName: merge.name, creditTransferred, loginTransferred };
  } catch {
    return { ok: false, error: "Não foi possível mesclar os cadastros. Tente novamente." };
  }
}
