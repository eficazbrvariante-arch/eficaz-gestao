import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import { prisma } from "@/lib/prisma";
import { ROOT_DOMAIN } from "@/modules/catalog/tenant-resolver";

/**
 * Conexão de domínio próprio ao catálogo.
 *
 * A verificação é feita por registro **TXT**, não pelo apontamento: assim a
 * empresa comprova que é dona do domínio antes de trocar o site que já está no ar.
 * O apontamento (CNAME) pode ser feito depois, no momento que ela escolher.
 */

/** Subdomínio onde a empresa publica o registro TXT de verificação. */
export const VERIFICATION_RECORD_PREFIX = "_eficaz-gestao";

/** Alvo do CNAME que faz o domínio responder pela aplicação. */
export const CNAME_TARGET = process.env.NEXT_PUBLIC_APP_HOST ?? `app.${ROOT_DOMAIN}`;

const DOMAIN_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

export type DomainValidation =
  | { ok: true; domain: string }
  | { ok: false; error: string };

/**
 * Normaliza e valida o domínio digitado pela empresa.
 * Aceita com ou sem `https://` e com barra no final, porque é assim que a
 * pessoa costuma copiar do navegador.
 */
export function normalizeDomain(input: string): DomainValidation {
  let value = input.trim().toLowerCase();

  value = value.replace(/^https?:\/\//, "");
  value = value.replace(/\/.*$/, "");
  value = value.replace(/:\d+$/, "");

  if (!value) return { ok: false, error: "Informe o domínio." };
  if (value.startsWith("www.")) {
    // O www é tratado como apelido do domínio raiz nas instruções de DNS.
    value = value.slice(4);
  }
  if (!DOMAIN_PATTERN.test(value)) {
    return {
      ok: false,
      error: "Domínio inválido. Use o formato minhaloja.com.br, sem http:// nem barras.",
    };
  }
  if (value === ROOT_DOMAIN || value.endsWith(`.${ROOT_DOMAIN}`)) {
    return {
      ok: false,
      error: `Este domínio pertence ao próprio sistema. Use um domínio seu, como minhaloja.com.br.`,
    };
  }

  return { ok: true, domain: value };
}

export function generateDomainToken() {
  return `eficaz-verificacao=${randomBytes(16).toString("hex")}`;
}

/** Nome completo do registro TXT que a empresa precisa criar. */
export function verificationRecordName(domain: string) {
  return `${VERIFICATION_RECORD_PREFIX}.${domain}`;
}

export type DnsCheck =
  | { found: true }
  | { found: false; reason: "missing" | "mismatch" | "dns-error"; detail?: string };

/**
 * Procura o registro TXT de verificação no DNS do domínio.
 *
 * Registros TXT longos vêm quebrados em pedaços; por isso cada resposta é
 * concatenada antes da comparação.
 */
export async function checkVerificationRecord(
  domain: string,
  expectedToken: string
): Promise<DnsCheck> {
  try {
    const records = await dns.resolveTxt(verificationRecordName(domain));
    const values = records.map((chunks) => chunks.join("").trim());
    if (values.some((value) => value === expectedToken)) return { found: true };
    return {
      found: false,
      reason: values.length > 0 ? "mismatch" : "missing",
      detail: values[0],
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // ENOTFOUND/ENODATA significam apenas que o registro ainda não existe ou
    // não propagou — não é erro de configuração do sistema.
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return { found: false, reason: "missing" };
    }
    return { found: false, reason: "dns-error", detail: code };
  }
}

/**
 * Confere se o domínio já aponta para a aplicação.
 * Serve para avisar a empresa que falta o CNAME; não bloqueia a verificação.
 */
export async function checkDomainPointing(domain: string): Promise<boolean> {
  try {
    const records = await dns.resolveCname(domain);
    return records.some((record) => record.toLowerCase().includes(CNAME_TARGET.toLowerCase()));
  } catch {
    return false;
  }
}

export type VerifyResult =
  | { ok: true; status: "VERIFIED" | "ACTIVE"; pointing: boolean }
  | { ok: false; error: string };

/**
 * Verifica a posse do domínio e atualiza o status da empresa.
 * `ACTIVE` só quando a posse está comprovada **e** o domínio já aponta para cá.
 */
export async function verifyDomain(tenantId: string): Promise<VerifyResult> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { customDomain: true, domainToken: true },
  });

  if (!tenant.customDomain || !tenant.domainToken) {
    return { ok: false, error: "Nenhum domínio cadastrado para verificar." };
  }

  const check = await checkVerificationRecord(tenant.customDomain, tenant.domainToken);

  if (!check.found) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { domainCheckedAt: new Date() },
    });

    if (check.reason === "dns-error") {
      return {
        ok: false,
        error: "Não foi possível consultar o DNS deste domínio agora. Tente novamente em alguns minutos.",
      };
    }
    if (check.reason === "mismatch") {
      return {
        ok: false,
        error: "Encontramos um registro TXT, mas com valor diferente do esperado. Confira se copiou o valor inteiro.",
      };
    }
    return {
      ok: false,
      error: "Ainda não encontramos o registro TXT. A propagação do DNS pode levar de alguns minutos a algumas horas.",
    };
  }

  const pointing = await checkDomainPointing(tenant.customDomain);
  const status = pointing ? "ACTIVE" : "VERIFIED";

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      domainStatus: status,
      domainVerifiedAt: new Date(),
      domainCheckedAt: new Date(),
    },
  });

  return { ok: true, status, pointing };
}
