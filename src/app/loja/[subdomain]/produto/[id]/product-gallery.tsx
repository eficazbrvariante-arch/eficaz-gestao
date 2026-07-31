"use client";

import { useState } from "react";

export function ProductGallery({
  images,
  alt,
}: {
  images: { id: string; url: string }[];
  alt: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400">
        sem imagem
      </div>
    );
  }

  const active = images[Math.min(activeIndex, images.length - 1)];

  return (
    <div>
      <div className="aspect-square overflow-hidden rounded-xl bg-slate-50">
        {/* URLs cadastradas livremente pela empresa: domínio desconhecido em build time. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={active.url} alt={alt} className="h-full w-full object-contain p-6" />
      </div>

      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`Ver imagem ${index + 1}`}
              className={[
                "h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-slate-50",
                index === activeIndex ? "border-slate-900" : "border-slate-200",
              ].join(" ")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt=""
                loading="lazy"
                className="h-full w-full object-contain p-1"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
