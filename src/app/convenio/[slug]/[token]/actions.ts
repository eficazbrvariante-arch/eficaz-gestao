"use server";

import { prisma } from "@/lib/prisma";
import { generateResetToken, hashToken } from "@/lib/tokens";
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
    include: { convenio: true },
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

  const credential = generateResetToken();
  await prisma.convenioMember.create({
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
    },
  });

  return { ok: true as const, credentialUrl: credentialUrl(credential.rawToken) };
}
