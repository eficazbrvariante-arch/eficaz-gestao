"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Button } from "@/components/ui/button";
import { FormBanner } from "@/components/ui/form-banner";

type Mode = "starting" | "live" | "preview" | "fallback" | "waive";

/**
 * Captura de selfie ao vivo (webcam/câmera frontal) com fallback gracioso:
 * se `getUserMedia` não estiver disponível ou for negado, cai para um
 * `<input capture="user">` (ainda abre a câmera em mobile, sem travar
 * desktop); se nada funcionar e `canWaive` for verdadeiro, permite registrar
 * sem foto mediante motivo obrigatório.
 */
export function SelfieCaptureField({
  onCaptured,
  onWaive,
  canWaive = false,
  disabled = false,
}: {
  onCaptured: (url: string) => void;
  onWaive?: (reason: string) => void;
  canWaive?: boolean;
  disabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("starting");
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [capturedBlob, setCapturedBlob] = useState<Blob>();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();
  const [waiveReason, setWaiveReason] = useState("");

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Promise (não async/await) de propósito: o corpo só roda dentro do
  // `.then`/`.catch`, nunca sincronamente na chamada — evita disparar setState
  // direto durante a fase síncrona do efeito que a invoca.
  const startCamera = useCallback(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      return Promise.resolve().then(() => setMode("fallback"));
    }
    return navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        setMode("live");
      })
      .catch(() => {
        setMode("fallback");
      });
  }, []);

  useEffect(() => {
    startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);

  // O <video> só existe no DOM quando mode === "live" (ver JSX abaixo), então
  // o srcObject precisa ser anexado aqui, depois que ele monta — setá-lo
  // dentro do .then() do getUserMedia é tarde demais, o ref ainda é null lá.
  useEffect(() => {
    if (mode === "live" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [mode]);

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Espelha o quadro capturado para bater com o preview em espelho (natural
    // pra quem está se vendo tirar a foto).
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        setMode("preview");
        stopCamera();
      },
      "image/jpeg",
      0.85
    );
  }

  function handleFallbackFile(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    setCapturedBlob(file);
    setPreviewUrl(URL.createObjectURL(file));
    setMode("preview");
  }

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(undefined);
    setCapturedBlob(undefined);
    setError(undefined);
    setMode("starting");
    if (fileInputRef.current) fileInputRef.current.value = "";
    startCamera();
  }

  async function confirm() {
    if (!capturedBlob) return;
    setUploading(true);
    setError(undefined);
    try {
      const blob = await upload(`selfie-${Date.now()}.jpg`, capturedBlob, {
        access: "public",
        handleUploadUrl: "/api/ponto/upload",
        contentType: capturedBlob.type || "image/jpeg",
      });
      onCaptured(blob.url);
    } catch {
      setError("Não foi possível enviar a selfie. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }

  function submitWaive() {
    if (!waiveReason.trim()) {
      setError("Informe o motivo da dispensa de selfie.");
      return;
    }
    setError(undefined);
    onWaive?.(waiveReason.trim());
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {mode === "starting" && (
        <p className="py-6 text-center text-sm text-slate-500">Iniciando câmera...</p>
      )}

      {mode === "live" && (
        <div className="space-y-3">
          <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-lg bg-slate-900">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full scale-x-[-1] object-cover"
            />
          </div>
          <Button type="button" onClick={capture} disabled={disabled}>
            Tirar foto
          </Button>
          <button
            type="button"
            onClick={() => setMode("fallback")}
            className="block w-full text-center text-xs text-slate-500 hover:underline"
          >
            Problema com a câmera?
          </button>
        </div>
      )}

      {mode === "preview" && previewUrl && (
        <div className="space-y-3">
          <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-lg bg-slate-900">
            {/* eslint-disable-next-line @next/next/no-img-element -- preview local (object URL), não é uma imagem otimizável */}
            <img src={previewUrl} alt="Prévia da selfie" className="h-full w-full object-cover" />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={retake} disabled={uploading}>
              Tirar novamente
            </Button>
            <Button type="button" onClick={confirm} disabled={disabled || uploading}>
              {uploading ? "Enviando..." : "Confirmar"}
            </Button>
          </div>
        </div>
      )}

      {mode === "fallback" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Não foi possível acessar a câmera diretamente. Use o botão abaixo — em celular, ele abre a
            câmera do aparelho.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            disabled={disabled}
            onChange={(e) => handleFallbackFile(e.target.files?.[0])}
          />
          <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
            Tirar/selecionar foto
          </Button>
          <button
            type="button"
            onClick={() => {
              setMode("starting");
              startCamera();
            }}
            className="block w-full text-center text-xs text-slate-500 hover:underline"
          >
            Tentar câmera novamente
          </button>
          {canWaive && (
            <button
              type="button"
              onClick={() => setMode("waive")}
              className="block w-full text-center text-xs text-slate-500 hover:underline"
            >
              Registrar sem foto
            </button>
          )}
        </div>
      )}

      {mode === "waive" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Registro sem selfie exige um motivo — fica registrado na auditoria.
          </p>
          <textarea
            value={waiveReason}
            onChange={(e) => setWaiveReason(e.target.value)}
            placeholder="Motivo da dispensa da selfie"
            rows={3}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            disabled={disabled}
          />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setMode("fallback")}>
              Voltar
            </Button>
            <Button type="button" onClick={submitWaive} disabled={disabled}>
              Confirmar sem foto
            </Button>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
      <FormBanner message={error} variant="error" />
    </div>
  );
}
