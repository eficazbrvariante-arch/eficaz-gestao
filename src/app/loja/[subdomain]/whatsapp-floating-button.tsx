"use client";

import { useState } from "react";

const DEFAULT_MESSAGE = "Olá, vim pelo catálogo online!";

export function WhatsappFloatingButton({ whatsapp }: { whatsapp: string }) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const digits = whatsapp.replace(/\D/g, "");
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(DEFAULT_MESSAGE)}`;

  return (
    <div className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
      <div className="relative">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Falar no WhatsApp"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:brightness-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.81L2 22l5.41-1.42a9.87 9.87 0 0 0 4.63 1.18h.01c5.46 0 9.9-4.45 9.9-9.91C21.95 6.45 17.5 2 12.04 2Zm5.79 14.13c-.25.7-1.25 1.32-1.71 1.4-.44.08-.99.11-1.6-.1-.37-.12-.85-.28-1.46-.55-2.58-1.12-4.26-3.73-4.39-3.9-.13-.17-1.05-1.4-1.05-2.67 0-1.27.66-1.9.9-2.16.23-.26.5-.32.67-.32.17 0 .33 0 .48.01.16.01.36-.06.56.43.21.5.71 1.73.77 1.86.06.13.1.28.02.45-.08.17-.13.28-.25.43-.13.15-.27.34-.38.46-.13.13-.26.27-.11.53.15.26.68 1.12 1.46 1.82 1 .89 1.85 1.17 2.11 1.3.26.13.41.11.56-.07.15-.17.65-.76.83-1.02.17-.26.34-.21.57-.13.23.09 1.47.69 1.72.82.25.13.42.19.48.3.06.11.06.63-.19 1.33Z" />
          </svg>
        </a>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Fechar"
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-white shadow hover:bg-slate-800"
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
    </div>
  );
}
