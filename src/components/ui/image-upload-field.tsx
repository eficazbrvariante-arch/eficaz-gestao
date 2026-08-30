"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Button } from "@/components/ui/button";

export function ImageUploadField({
  value,
  onChange,
  disabled,
  uploadUrl = "/api/produtos/upload",
  clientPayload,
  maxSizeBytes = 5 * 1024 * 1024,
  access = "public",
}: {
  value?: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  /** Endpoint de upload — outro além do padrão (ex.: cadastro público de Convênios, sem sessão). */
  uploadUrl?: string;
  /** Repassado ao endpoint de upload como `clientPayload` (ver `/api/convenios/upload`). */
  clientPayload?: string;
  /**
   * `'private'` pra documento sensível sem URL pública (ver Crédito Eficaz)
   * — `onChange` recebe o pathname (não dá pra exibir via `<img src>` sem
   * passar por uma rota autenticada, então o preview fica só local/genérico
   * depois do envio). Default `'public'` preserva todo chamador existente.
   */
  access?: "public" | "private";
  /**
   * Precisa bater com o `maximumSizeInBytes` real da rota de upload (ver
   * arquivo de rota correspondente) — checado aqui ANTES de tentar enviar,
   * pra recusar na hora com mensagem clara. Sem isso, foto de celular real
   * (frequentemente 6-15MB) estourava o limite do servidor sem avisar nada:
   * o botão só ficava em "Enviando..." indefinidamente numa conexão de
   * dados móvel, parecendo travado.
   */
  maxSizeBytes?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | undefined>(value);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string>();

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setError(undefined);

    if (file.size > maxSizeBytes) {
      setError(
        `Foto muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB) — o limite é ${(maxSizeBytes / 1024 / 1024).toFixed(0)}MB. Tente uma foto com menos qualidade/resolução.`
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setIsUploading(true);
    try {
      const blob = await upload(file.name, file, {
        access,
        handleUploadUrl: uploadUrl,
        contentType: file.type,
        clientPayload,
      });
      if (access === "private") {
        // Blob privado não carrega via <img src> sem passar por uma rota
        // autenticada — mantém só o preview local (object URL) já mostrado
        // acima, não tenta trocar pela URL remota.
        onChange(blob.pathname);
      } else {
        onChange(blob.url);
        setPreview(blob.url);
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      setError("Não foi possível enviar a imagem. Tente novamente.");
      setPreview(value);
      URL.revokeObjectURL(objectUrl);
    } finally {
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
