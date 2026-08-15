"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { generateResetToken, hashToken } from "@/lib/tokens";
import { generateUniqueConvenioShortCode } from "@/modules/convenios/convenio-redemption-service";
import { registerCustomer, isUsernameAvailable } from "@/modules/customers/customer-service";
import { storeOrigin } from "@/modules/catalog/tenant-resolver";
import {
  buildConvenioSignupSchema,
  parseConvenioRules,
  type ConvenioSignupInput,
} from "@/lib/validations/convenio";

function credentialUrl(rawToken: string) {
  const origin = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${origin}/c/${rawToken}`;
}

/**
 * Cadastro público — sem login, sem `requireUser()`. O token do link é a
 * única credencial: resolvido pelo hash, nunca guardado em claro (ver
 * `ConvenioInvite.tokenHash`). Mensagens de erro são sempre genéricas — não
 * revelam se o link já existiu, foi revogado ou expirou, mesmo princípio já
 * usado em `resetPasswordAction`.
 */
export async function submitConvenioSignupAction(rawToken: string, input: ConvenioSignupInput) {
  const invite = await prisma.convenioInvite.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: {
      convenio: true,
      tenant: { select: { subdomain: true, customDomain: true, domainStatus: true } },
    },
  });
  if (!invite || invite.revokedAt || (invite.expiresAt && invite.expiresAt < new Date())) {
    return { error: "Este link não é mais válido. Peça um link novo pra empresa." };
  }
  if (!invite.convenio.active) {
    return { error: "Este convênio não está mais disponível." };
  }

  const rules = parseConvenioRules(invite.convenio.rules);
  const parsed = buildConvenioSignupSchema(rules.requireProof).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const duplicate = await prisma.convenioMember.findFirst({
    where: { convenioId: invite.convenioId, document: parsed.data.document },
  });
  if (duplicate) {
    return {
      error:
        "Esse CPF já está cadastrado neste convênio. Se você já se cadastrou antes, aguarde a aprovação.",
    };
  }

  if (!(await isUsernameAvailable(invite.tenantId, parsed.data.username))) {
    return { error: "Esse usuário já está em uso. Escolha outro.", field: "username" as const };
  }

  const credential = generateResetToken();
  const shortCode = await generateUniqueConvenioShortCode(invite.tenantId);

  // Colaborador e login de cliente nascem juntos, na mesma transação — é essa
  // referência direta (`Customer.convenioMemberId`), não uma comparação de
  // CPF/telefone feita depois, que liga os dois cadastros (ver decisão
  // registrada em `mergeCustomers` contra vínculo automático por documento).
  try {
    await prisma.$transaction(async (tx) => {
      const createdMember = await tx.convenioMember.create({
        data: {
          tenantId: invite.tenantId,
          convenioId: invite.convenioId,
          name: parsed.data.name,
          document: parsed.data.document,
          phone: parsed.data.phone,
          email: parsed.data.email || null,
          selfieUrl: parsed.data.selfieUrl,
          proofUrl: parsed.data.proofUrl || null,
          consentAcceptedAt: new Date(),
          credentialTokenHash: credential.hashedToken,
          shortCode,
        },
        select: { id: true },
      });

      await registerCustomer(tx, invite.tenantId, {
        username: parsed.data.username,
        password: parsed.data.password,
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email || null,
        document: parsed.data.document,
        convenioMemberId: createdMember.id,
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Esse usuário já está em uso. Escolha outro.", field: "username" as const };
    }
    throw error;
  }

  return {
    ok: true as const,
    credentialUrl: credentialUrl(credential.rawToken),
    shortCode,
    // Sem prefixo `/loja/[subdomain]` — esse caminho só existe quando a
    // loja é acessada pelo host da aplicação; pelo host de verdade (aqui,
    // `storeOrigin`) a rota pública já é só `/conta/entrar` (ver
    // `cookiePathForStore` em `customer-session.ts`).
    storeLoginUrl: `${storeOrigin(invite.tenant)}/conta/entrar`,
  };
}
