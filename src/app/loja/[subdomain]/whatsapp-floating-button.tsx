"use client";

import { useState } from "react";
import Image from "next/image";
import { buildWhatsappLink } from "@/lib/whatsapp";
import { WhatsappIcon } from "./icons";

const DEFAULT_MESSAGE = "Olá, vim pelo catálogo online!";

export function WhatsappFloatingButton({
  whatsapp,
  instagramUrl,
}: {
  whatsapp: string;
  /** Só aparece o ícone do Instagram se a loja tiver um link real cadastrado. */
  instagramUrl?: string | null;
}) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const whatsappHref = buildWhatsappLink(whatsapp, DEFAULT_MESSAGE);

  return (
    <div className="fixed bottom-8 right-4 z-40 flex flex-col items-center gap-2 sm:bottom-10 sm:right-6">
      <div className="relative">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Falar no WhatsApp"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:brightness-95"
        >
          <WhatsappIcon className="h-7 w-7" />
        </a>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Fechar"
          className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-white shadow hover:bg-slate-800"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {instagramUrl && (
        <a
          href={instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ver Instagram"
          className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full shadow-lg transition hover:brightness-95"
        >
          <Image src="/instagram-icon.jpg" alt="" fill sizes="44px" className="object-cover" />
        </a>
      )}
    </div>
  );
}
