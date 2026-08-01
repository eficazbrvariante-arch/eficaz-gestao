import { NextResponse } from "next/server";
import { subdomainFromHost } from "@/modules/catalog/tenant-resolver";

/**
 * Mostra como a aplicação enxerga o host da requisição.
 *
 * Existe porque um erro de configuração de domínio é invisível de fora: a
 * mesma tela de 404 aparece se a rota não existe, se a variável está errada ou
 * se o build é antigo. Aqui o servidor responde o que de fato recebeu.
 *
 * Fica em `/api`, único caminho que o proxy não reescreve (ver o `matcher` em
 * proxy.ts) — então continua acessível justamente quando o roteamento por
 * domínio está quebrado.
 *
 * Só expõe configuração pública: os valores `NEXT_PUBLIC_` já vão embutidos no
 * código enviado ao navegador. Nenhum segredo passa por aqui.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const host = request.headers.get("host");
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? null;
  const subdominio = subdomainFromHost(host);

  return NextResponse.json({
    hostRecebido: host,
    NEXT_PUBLIC_ROOT_DOMAIN: rootDomain,
    NEXT_PUBLIC_APP_HOST: process.env.NEXT_PUBLIC_APP_HOST ?? null,
    subdominioDetectado: subdominio,
    // O que o proxy fará com este host: sem subdomínio, serve o painel; com
    // subdomínio, reescreve tudo para /loja/<nome> — origem do 404 quando o
    // domínio do painel é lido como se fosse o de uma loja.
    veredito: subdominio
      ? `Este host está sendo tratado como a loja "${subdominio}". Toda rota vira /loja/${subdominio}/...`
      : "Este host está sendo tratado como o painel administrativo.",
  });
}
