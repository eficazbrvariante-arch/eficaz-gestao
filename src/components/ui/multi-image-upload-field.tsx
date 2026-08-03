"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";

export function MultiImageUploadField({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string>();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(undefined);
    setIsUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const blob = await upload(file.name, file, {
          access: "public",
          handleUploadUrl: "/api/produtos/upload",
          contentType: file.type,
        });
        uploaded.push(blob.url);
      }
      onChange([...value, ...uploaded]);
    } catch {
      setError("Não foi possível enviar uma ou mais fotos. Tente novamente.");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleRemove(url: string) {
    onChange(value.filter((item) => item !== url));
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        disabled={disabled || isUploading}
        onChange={(e) => handleFiles(e.target.files)}
      />

      <button
        type="button"
        disabled={disabled || isUploading}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        className="w-full rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="font-medium text-slate-700">
          {isUploading ? "Enviando..." : "Clique para adicionar foto"}
        </span>
        <br />
        ou arraste imagens aqui — PNG, JPG até 10MB cada
      </button>

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}

      {value.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((url) => (
            <div key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- domínio da imagem não é conhecido em build time */}
              <img
                src={url}
                alt="Foto do aparelho"
                className="h-24 w-full rounded-md border border-slate-200 object-cover"
              />
              <button
                type="button"
                onClick={() => handleRemove(url)}
                aria-label="Remover foto"
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
          ))}
        </div>
      )}
    </div>
  );
}
