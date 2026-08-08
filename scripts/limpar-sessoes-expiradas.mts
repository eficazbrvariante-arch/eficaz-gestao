/**
 * Apaga sessões de cliente (`CustomerSession`) expiradas ou revogadas há mais
 * de 7 dias, e tentativas de login (`CustomerLoginAttempt`) fora da janela de
 * rate limit — nenhuma das duas precisa ficar acumulando pra sempre. Sem cron
 * configurado no projeto ainda; rodar manualmente ou agendar (Vercel Cron ou
 * similar) para rodar com regularidade.
 *
 * Uso:
 *   npx tsx scripts/limpar-sessoes-expiradas.mts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { prisma } from "../src/lib/prisma";

const SESSION_RETENTION_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias após expirar/revogar
const LOGIN_ATTEMPT_RETENTION_MS = 1000 * 60 * 60 * 24; // 1 dia — bem além da janela de rate limit (15 min)

const sessionCutoff = new Date(Date.now() - SESSION_RETENTION_MS);
const attemptCutoff = new Date(Date.now() - LOGIN_ATTEMPT_RETENTION_MS);

const sessions = await prisma.customerSession.deleteMany({
  where: {
    OR: [{ expiresAt: { lt: sessionCutoff } }, { revokedAt: { lt: sessionCutoff } }],
  },
});

const attempts = await prisma.customerLoginAttempt.deleteMany({
  where: { createdAt: { lt: attemptCutoff } },
});

console.log(`Sessões removidas: ${sessions.count}`);
console.log(`Tentativas de login removidas: ${attempts.count}`);

await prisma.$disconnect();
