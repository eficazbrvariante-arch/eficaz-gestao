import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
