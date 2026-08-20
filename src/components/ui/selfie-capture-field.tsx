"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Wrench } from "lucide-react";
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
  uploadUrl = "/api/ponto/upload",
  clientPayload,
  maxSizeBytes = 3 * 1024 * 1024,
}: {
  onCaptured: (url: string) => void;
  onWaive?: (reason: string) => void;
  canWaive?: boolean;
  disabled?: boolean;
  /** Endpoint de upload — outro além do Ponto (ex.: cadastro público de Convênios, sem sessão). */
  uploadUrl?: string;
  /** Repassado ao endpoint de upload como `clientPayload` (ver `/api/convenios/upload`). */
  clientPayload?: string;
  /**
   * Precisa bater com o `maximumSizeInBytes` real da rota de upload — só se
   * aplica ao fallback de arquivo (a captura ao vivo já sai pequena, sempre
   * comprimida em `capture()` abaixo). Sem essa checagem, uma foto grande
   * escolhida da galeria estourava o limite do servidor sem aviso nenhum,
   * ficando "Enviando..." pra sempre.
   */
  maxSizeBytes?: number;
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
  const [fixing, setFixing] = useState(false);
  const [fixMessage, setFixMessage] = useState<string>();

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

  /**
   * "Corrigir câmera": em vez de só tentar de novo, primeiro diagnostica o
   * que está impedindo o acesso (permissão bloqueada, nenhuma câmera no
   * aparelho, câmera ocupada por outro app) e mostra uma mensagem específica
   * pra quem está na loja resolver sozinho — sem precisar pedir ajuda.
   * Página nenhuma consegue reverter uma permissão negada pelo navegador via
   * código (é decisão do usuário/SO), então nesse caso a "correção" é
   * instrução clara de onde tocar.
   */
  async function fixCamera() {
    setFixing(true);
    setFixMessage(undefined);
    setError(undefined);
    stopCamera();

    try {
      if (navigator.permissions?.query) {
        try {
          const status = await navigator.permissions.query({
            name: "camera" as PermissionName,
          });
          if (status.state === "denied") {
            setFixMessage(
              "A câmera está bloqueada nas permissões do navegador. Toque no ícone de cadeado/informações ao lado do endereço do site, permita a câmera e toque em \"Corrigir câmera\" de novo."
            );
            return;
          }
        } catch {
          // Navegador sem suporte à Permissions API pra câmera (ex.: Firefox/Safari) — segue pra tentar getUserMedia direto.
        }
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setFixMessage("Este navegador não suporta acesso à câmera.");
        return;
      }

      if (navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!devices.some((d) => d.kind === "videoinput")) {
          setFixMessage("Nenhuma câmera encontrada neste aparelho.");
          return;
        }
      }

      try {
        // Primeiro tenta a frontal (padrão de selfie); alguns aparelhos (ex.:
        // webcam de PC) não respeitam `facingMode`, daí o retry sem restrição.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        streamRef.current = stream;
        setMode("live");
        return;
      } catch {
        // segue pro retry abaixo
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      setMode("live");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError") {
        setFixMessage(
          "O navegador negou o acesso à câmera. Toque no ícone de cadeado/informações ao lado do endereço do site, permita a câmera e toque em \"Corrigir câmera\" de novo."
        );
      } else if (name === "NotReadableError") {
        setFixMessage(
          "A câmera está sendo usada por outro programa ou aba. Feche o que estiver usando a câmera e toque em \"Corrigir câmera\" de novo."
        );
      } else {
        setFixMessage(
          "Não foi possível acessar a câmera. Tente de novo ou use o botão de tirar/selecionar foto abaixo."
        );
      }
    } finally {
      setFixing(false);
    }
  }

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
    if (file.size > maxSizeBytes) {
      setError(
        `Foto muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB) — o limite é ${(maxSizeBytes / 1024 / 1024).toFixed(0)}MB. Tente uma foto com menos qualidade/resolução.`
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
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
        handleUploadUrl: uploadUrl,
        contentType: capturedBlob.type || "image/jpeg",
        clientPayload,
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
          <Button type="button" onClick={fixCamera} disabled={disabled || fixing} className="gap-1.5">
            <Wrench className="size-4" />
            {fixing ? "Verificando câmera..." : "Corrigir câmera"}
          </Button>
          <FormBanner message={fixMessage} variant="error" />
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
