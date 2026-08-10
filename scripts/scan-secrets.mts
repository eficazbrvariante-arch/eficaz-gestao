/**
 * Scan de segredos antes do `git push`. Duas camadas:
 *  1. Compara o que ainda não foi enviado ao remoto com os valores reais de
 *     `.env.local`/`.env` — se um valor real aparece no diff, é quase certo
 *     que é um segredo vazando (não é heurística, é o segredo de verdade).
 *  2. Padrões genéricos de segredo (chave privada, AWS, tokens longos etc.),
 *     para pegar um segredo novo que ainda não está em `.env.local`.
 *
 * Sai com código 1 (bloqueia o push, via hook) se achar algo; senão sai 0.
 *
 * Uso:
 *   npx tsx scripts/scan-secrets.mts
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const MIN_SECRET_VALUE_LENGTH = 8;

/** Chaves de .env.local/.env que não são segredos de verdade (URL pública, e-mail de remetente etc.) — não vale a pena comparar o valor delas contra o diff. */
const NON_SECRET_KEYS = new Set(["NEXTAUTH_URL", "EMAIL_FROM"]);

function git(command: string): string {
  try {
    return execSync(`git ${command}`, { encoding: "utf8", maxBuffer: 1024 * 1024 * 50 });
  } catch {
    return "";
  }
}

function currentBranch(): string {
  return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
}

function hasRef(ref: string): boolean {
  try {
    execSync(`git rev-parse --verify ${ref}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Diff do que ainda não foi enviado ao remoto, mais o que está staged/working — cobre o que um `git push` levaria. */
function outgoingDiff(): string {
  const branch = currentBranch();
  const upstreamCandidates = [`@{u}`, `origin/${branch}`];
  let base: string | null = null;
  for (const candidate of upstreamCandidates) {
    if (hasRef(candidate)) {
      base = candidate;
      break;
    }
  }

  const parts: string[] = [];
  if (base) parts.push(git(`diff ${base}..HEAD`));
  else parts.push(git("show HEAD")); // sem upstream conhecido: pelo menos o último commit
  parts.push(git("diff --staged"));
  parts.push(git("diff"));
  return parts.join("\n");
}

function realSecretValues(): { key: string; value: string }[] {
  const found: { key: string; value: string }[] = [];
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)="?([^"\n]*)"?\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      const value = rawValue.trim();
      if (NON_SECRET_KEYS.has(key)) continue;
      if (value.length >= MIN_SECRET_VALUE_LENGTH) found.push({ key, value });
    }
  }
  return found;
}

const GENERIC_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "chave privada", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "AWS Access Key ID", pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "URL do Postgres com credenciais", pattern: /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/ },
  { name: "chave da API do Resend", pattern: /\bre_[A-Za-z0-9_]{20,}\b/ },
  { name: "token do Slack", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "token genérico longo (KEY/SECRET/TOKEN/PASSWORD)", pattern: /(?:KEY|SECRET|TOKEN|PASSWORD)\s*[:=]\s*["']?[A-Za-z0-9_\-./+]{20,}["']?/i },
];

const diff = outgoingDiff();
const problems: string[] = [];

for (const { key, value } of realSecretValues()) {
  if (diff.includes(value)) {
    problems.push(`Valor real de ${key} (de .env.local/.env) aparece no que será enviado ao remoto.`);
  }
}

/** `parsed.data.password`, `user.email`, etc. — referência a propriedade no código, não um valor literal de segredo. */
const DOTTED_IDENTIFIER = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/;

for (const { name, pattern } of GENERIC_PATTERNS) {
  const match = diff.match(pattern);
  if (match) {
    const value = match[0].replace(/^(?:KEY|SECRET|TOKEN|PASSWORD)\s*[:=]\s*["']?/i, "").replace(/["']?$/, "");
    if (DOTTED_IDENTIFIER.test(value)) continue;
    problems.push(`Padrão de segredo encontrado (${name}): ${match[0].slice(0, 40)}...`);
  }
}

if (problems.length > 0) {
  console.error("BLOQUEADO: possível segredo no que está prestes a ser enviado ao Git.\n");
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(
    "\nSe for falso positivo, revise manualmente antes de subir. Nunca contorne isso sem ter certeza."
  );
  process.exit(1);
}

console.log("Scan de segredos: nada encontrado.");
