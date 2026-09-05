import { getStoreBySubdomain, storeDisplayName } from "@/modules/catalog/tenant-resolver";
import { normalizeHexColor, readableTextOn } from "@/modules/pwa/store-icon";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Tela mostrada quando o visitante abre a loja sem conexão.
 *
 * É um documento HTML completo e autossuficiente, não uma página do Next, de
 * propósito: offline não há garantia nenhuma de que o CSS e os chunks de JS do
 * Next estejam no cache do navegador. Estilo embutido e zero dependência
 * externa é a única forma de garantir que esta tela sempre apareça inteira —
 * que é justamente a hora em que ela precisa funcionar.
 *
 * A única imagem é o ícone da própria PWA, que o Service Worker já pré-carrega
 * junto com esta página (o logo no Blob não estaria disponível offline).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ subdomain: string }> }
): Promise<Response> {
  const { subdomain } = await params;

  const store = await getStoreBySubdomain(subdomain);
  if (!store) {
    return new Response("Loja não encontrada.", { status: 404 });
  }

  const name = escapeHtml(storeDisplayName(store));
  const brand = normalizeHexColor(store.primaryColor) ?? "#0f172a";
  const onBrand = readableTextOn(brand);
  const icon = `/loja/${encodeURIComponent(subdomain)}/icones/192.png`;

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="${brand}">
<title>Sem conexão — ${name}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: #f8fafc;
    color: #0f172a;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .card { width: 100%; max-width: 380px; text-align: center; }
  .logo {
    width: 72px; height: 72px; margin: 0 auto 20px;
    border-radius: 18px; object-fit: contain;
    background: #fff; border: 1px solid #e2e8f0;
  }
  h1 { margin: 0 0 8px; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
  p { margin: 0 0 24px; font-size: 15px; color: #475569; }
  button {
    width: 100%; min-height: 48px; padding: 12px 20px;
    border: 0; border-radius: 10px;
    background: ${brand}; color: ${onBrand};
    font: inherit; font-size: 15px; font-weight: 600;
    cursor: pointer;
  }
  button:focus-visible { outline: 3px solid ${brand}; outline-offset: 3px; }
  .store { margin: 24px 0 0; font-size: 13px; color: #94a3b8; }
</style>
</head>
<body>
  <main class="card">
    <img class="logo" src="${icon}" alt="" width="72" height="72">
    <h1>Sem conexão no momento</h1>
    <p>Verifique sua internet e tente novamente.</p>
    <button type="button" id="retry">TENTAR NOVAMENTE</button>
    <p class="store">${name}</p>
  </main>
  <script>
    document.getElementById("retry").addEventListener("click", function () {
      location.reload();
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Quem guarda esta página é o Service Worker, no `install`. O navegador
      // não deve manter uma cópia própria por fora disso.
      "Cache-Control": "no-store",
    },
  });
}
