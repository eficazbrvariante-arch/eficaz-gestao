/**
 * Cria/atualiza a `WhatsAppIntegration` de um tenant em dev, cifrando o
 * access token antes de gravar. Ponte manual até existir uma tela de
 * configurações (fora do escopo da Fase 2) — sem isso não há como testar o
 * webhook contra um `phoneNumberId` de verdade.
 *
 * Uso:
 *   npx tsx scripts/whatsapp-set-integration.mts \
 *     --subdomain=minhaloja \
 *     --phone-number-id=123456789 \
 *     --waba-id=987654321 \
 *     --access-token=EAAG... \
 *     [--display-phone="+55 11 99999-8888"]
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { prisma } from "../src/lib/prisma";
import { encryptSecret } from "../src/modules/whatsapp/token-crypto";

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const subdomain = args["subdomain"];
const phoneNumberId = args["phone-number-id"];
const wabaId = args["waba-id"];
const accessToken = args["access-token"];
const displayPhoneNumber = args["display-phone"];

if (!subdomain || !phoneNumberId || !wabaId || !accessToken) {
  console.error(
    "Uso: npx tsx scripts/whatsapp-set-integration.mts --subdomain=... --phone-number-id=... --waba-id=... --access-token=... [--display-phone=...]",
  );
  process.exit(1);
}

const tenant = await prisma.tenant.findUnique({ where: { subdomain }, select: { id: true, name: true } });
if (!tenant) {
  console.error(`Nenhum tenant encontrado com subdomínio "${subdomain}".`);
  process.exit(1);
}

const integration = await prisma.whatsAppIntegration.upsert({
  where: { tenantId: tenant.id },
  update: {
    phoneNumberId,
    wabaId,
    displayPhoneNumber,
    accessToken: encryptSecret(accessToken),
    status: "ACTIVE",
    connectedAt: new Date(),
    lastErrorMessage: null,
  },
  create: {
    tenantId: tenant.id,
    phoneNumberId,
    wabaId,
    displayPhoneNumber,
    accessToken: encryptSecret(accessToken),
    status: "ACTIVE",
    connectedAt: new Date(),
  },
});

console.log(`Integração de WhatsApp configurada para "${tenant.name}" (${subdomain}): ${integration.id}`);

await prisma.$disconnect();
