/**
 * Checagem rápida de início de sessão: branch atual, se o `git status` está
 * limpo, e se o `DATABASE_URL` local aponta para o host de produção do Neon
 * (não deveria — o ambiente local usa a branch `dev-local`). Não bloqueia
 * nada, só avisa — quem decide como prosseguir é quem lê o aviso.
 *
 * Uso:
 *   npx tsx scripts/check-repo-status.mts
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

/** Host da branch `production` no Neon (projeto "Eficazbr Gestão") — nunca deve aparecer em `.env.local`. */
const NEON_PRODUCTION_HOST = "ep-withered-sunset-ac630s1q.sa-east-1.aws.neon.tech";

function git(command: string): string {
  try {
    return execSync(`git ${command}`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function readDatabaseHost(): string | null {
  if (!existsSync(".env.local")) return null;
  const content = readFileSync(".env.local", "utf8");
  const match = content.match(/^DATABASE_URL="?[^@\n]*@([^/\s"]+)/m);
  return match ? match[1] : null;
}

const branch = git("rev-parse --abbrev-ref HEAD") || "(desconhecida)";
const dirtyFiles = git("status --porcelain");
const dbHost = readDatabaseHost();

console.log(`Branch atual: ${branch}`);
console.log(dirtyFiles ? `Repositório com alterações não commitadas:\n${dirtyFiles}` : "Repositório limpo.");

if (dbHost === null) {
  console.log("Aviso: não encontrei DATABASE_URL em .env.local.");
} else if (dbHost === NEON_PRODUCTION_HOST) {
  console.error(
    `ATENÇÃO: DATABASE_URL local aponta para o host de PRODUÇÃO do Neon (${dbHost}). ` +
      "Confirme antes de rodar qualquer script que altera dados (seed, limpar-dados-demo, migrations)."
  );
} else {
  console.log(`DATABASE_URL local: ${dbHost} (branch de desenvolvimento, diferente de produção).`);
}
