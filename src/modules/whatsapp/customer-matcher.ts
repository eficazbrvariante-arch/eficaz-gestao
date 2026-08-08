import { prisma } from "@/lib/prisma";
import { normalizeToE164 } from "./phone-normalizer";

/**
 * Tenta achar um `Customer` já cadastrado cujo telefone bate com o contato do
 * WhatsApp. `Customer.phone`/`Customer.whatsapp` são texto livre e sem coluna
 * normalizada, então não dá pra filtrar no banco por igualdade — busca todos
 * os clientes do tenant com algum telefone preenchido e compara normalizando
 * cada um em memória. Para uma base de clientes muito grande isso vira uma
 * varredura completa a cada contato novo; aceitável para o volume de uma
 * loja, mas a solução correta a prazo é uma coluna `phoneE164` normalizada em
 * `Customer` com migração/backfill (fora do escopo desta fase — ver riscos
 * no plano). Best-effort: vira um rótulo interno pro atendente (Raio-X), não
 * concede acesso a nada — ver decisão registrada no plano desta fase.
 */
export async function findCustomerByPhone(tenantId: string, phoneE164: string): Promise<string | null> {
  const candidates = await prisma.customer.findMany({
    where: {
      tenantId,
      OR: [{ phone: { not: null } }, { whatsapp: { not: null } }],
    },
    select: { id: true, phone: true, whatsapp: true },
  });

  const match = candidates.find((candidate) => {
    const normalizedPhone = candidate.phone
      ? normalizeToE164(candidate.phone, { assumeBrazilIfNoCountryCode: true })
      : null;
    const normalizedWhatsapp = candidate.whatsapp
      ? normalizeToE164(candidate.whatsapp, { assumeBrazilIfNoCountryCode: true })
      : null;
    return normalizedPhone === phoneE164 || normalizedWhatsapp === phoneE164;
  });

  return match?.id ?? null;
}
