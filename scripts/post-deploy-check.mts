/**
 * Smoke test pós-deploy: status do deploy na Vercel, home do painel, home da
 * loja, uma página de produto e uma listagem por categoria (extraídas da
 * própria página, sem IDs fixos), a rota `comprar-whatsapp` (deve
 * redirecionar, nunca 500), e os logs de erro mais recentes.
 *
 * Uso:
 *   npx tsx scripts/post-deploy-check.mts [subdominio]
 *   (subdominio default: eficazbr)
 */
import { execSync } from "node:child_process";

const ADMIN_URL = "https://app.eficazbr.com.br";
const STORE_HOST = "https://www.eficazbr.com.br";
const subdomain = process.argv[2] ?? "eficazbr";

let failures = 0;

function fail(message: string) {
  failures++;
  console.error(`FALHOU: ${message}`);
}

function ok(message: string) {
  console.log(`OK: ${message}`);
}

async function checkStatus(url: string, expected: number | number[], label: string) {
  const expectedList = Array.isArray(expected) ? expected : [expected];
  try {
    const res = await fetch(url, { redirect: "manual" });
    if (expectedList.includes(res.status)) {
      ok(`${label} -> ${res.status}`);
    } else {
      fail(`${label} -> ${res.status} (esperado ${expectedList.join(" ou ")})`);
    }
    return res;
  } catch (error) {
    fail(`${label} -> erro de rede (${(error as Error).message})`);
    return null;
  }
}

console.log("== Status do deploy na Vercel ==");
try {
  // A Vercel CLI escreve a tabela de `inspect` em stderr, não stdout — precisa
  // do `2>&1` pra `execSync` (que só devolve stdout) conseguir capturar.
  const inspect = execSync(`npx vercel inspect ${ADMIN_URL.replace("https://", "")} 2>&1`, {
    encoding: "utf8",
  });
  const statusLine = inspect.split("\n").find((l) => l.trim().startsWith("status"));
  if (statusLine?.includes("Ready")) ok(`deploy de produção: ${statusLine.trim()}`);
  else fail(`deploy de produção não está Ready: ${statusLine?.trim() ?? "status não encontrado"}`);
} catch (error) {
  fail(`não consegui checar o status do deploy (${(error as Error).message})`);
}

console.log("\n== Páginas públicas ==");
await checkStatus(ADMIN_URL, 200, "Home do painel");
const storeHomeRes = await checkStatus(`${STORE_HOST}/loja/${subdomain}`, 200, "Home da loja");

const listingRes = await checkStatus(`${STORE_HOST}/loja/${subdomain}/produtos`, 200, "Listagem de produtos");
const listingHtml = listingRes?.status === 200 ? await listingRes.text() : "";

const productMatch = listingHtml.match(new RegExp(`/loja/${subdomain}/produto/([a-z0-9]+)`, "i"));
if (productMatch) {
  const productId = productMatch[1];
  await checkStatus(`${STORE_HOST}/loja/${subdomain}/produto/${productId}`, 200, `Página do produto ${productId}`);

  console.log("\n== Fluxo Comprar pelo WhatsApp ==");
  await checkStatus(
    `${STORE_HOST}/loja/${subdomain}/produto/${productId}/comprar-whatsapp`,
    [302, 307],
    "Rota comprar-whatsapp (deve redirecionar, não 500)"
  );
} else {
  fail("Não encontrei nenhum link de produto na listagem para testar a página de produto.");
}

const categoryMatch = listingHtml.match(/categoria=([a-z0-9]+)/i);
if (categoryMatch) {
  const categoryId = categoryMatch[1];
  await checkStatus(
    `${STORE_HOST}/loja/${subdomain}/produtos?categoria=${categoryId}`,
    200,
    `Listagem filtrada por categoria ${categoryId}`
  );
} else {
  console.log("Aviso: não encontrei link de categoria na listagem para testar o filtro.");
}
void storeHomeRes;

console.log("\n== Logs de erro recentes ==");
try {
  const logs = execSync("npx vercel logs --level error -n 20 2>&1", { encoding: "utf8" });
  if (logs.includes("No logs found")) ok("nenhum erro recente nos logs.");
  else {
    console.log(logs);
    console.log("Aviso: existem erros recentes nos logs — revise acima (podem ser antigos, não necessariamente deste deploy).");
  }
} catch (error) {
  console.log(`Aviso: não consegui buscar os logs (${(error as Error).message})`);
}

console.log(`\n${failures === 0 ? "Tudo certo." : `${failures} checagem(ns) falharam.`}`);
process.exit(failures === 0 ? 0 : 1);
