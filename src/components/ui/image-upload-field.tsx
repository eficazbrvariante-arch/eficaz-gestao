"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Button } from "@/components/ui/button";

export function ImageUploadField({
  value,
  onChange,
  disabled,
}: {
  value?: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | undefined>(value);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string>();

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setError(undefined);

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setIsUploading(true);
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/produtos/upload",
        contentType: file.type,
      });
      onChange(blob.url);
      setPreview(blob.url);
    } catch {
      setError("Não foi possível enviar a imagem. Tente novamente.");
      setPreview(value);
    } finally {
      URL.revokeObjectURL(objectUrl);
      setIsUploading(false);
    }
  };

  const handleRemove = () => {
    setPreview(undefined);
    onChange("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- domínio da imagem não é conhecido em build time
        <img
          src={preview}
          alt="Pré-visualização da imagem do produto"
          className="mb-3 h-32 w-32 rounded-md border border-slate-200 object-cover"
        />
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        disabled={disabled || isUploading}
        onChange={(e) => handleFileChange(e.target.files?.[0])}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          fullWidth={false}
          disabled={disabled || isUploading}
          onClick={() => inputRef.current?.click()}
        >
          {isUploading ? "Enviando..." : preview ? "Trocar imagem" : "Selecionar imagem"}
        </Button>
        {preview && (
          <Button
            type="button"
            variant="ghost"
            fullWidth={false}
            disabled={disabled || isUploading}
            onClick={handleRemove}
          >
            Remover
          </Button>
        )}
      </div>

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
