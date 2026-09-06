import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O Next remove a barra final de qualquer URL com um redirect. Isso quebrava
  // a home da loja instalada como PWA: o escopo do Service Worker é
  // `/loja/<subdominio>/` (com barra), então `/loja/<subdominio>/` virava
  // `/loja/<subdominio>`, fora do escopo — e o app abria na única página que o
  // Service Worker não controla, sem tela offline. Com o redirect desligado
  // aqui, quem cuida da barra final é o `src/proxy.ts`: ele preserva a barra só
  // na home da loja e reproduz o redirect padrão em todo o resto.
  skipTrailingSlashRedirect: true,
  images: {
    // Fotos de produto, logo e banner são enviadas via @vercel/blob — o
    // hostname do storage é fixo por deploy (mesmo padrão para todo tenant),
    // então dá para otimizar com next/image sem precisar de domínio próprio.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
};

export default nextConfig;
