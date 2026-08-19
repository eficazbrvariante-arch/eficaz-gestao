"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormBanner } from "@/components/ui/form-banner";

const FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "qr_code",
];

/**
 * Botão "Escanear" que abre a câmera (traseira, quando existir) e lê código
 * de barras/QR ao vivo via `BarcodeDetector` nativo — sem lib extra. Só
 * Chrome/Edge (desktop e Android) suportam a API hoje; em navegadores sem
 * suporte (Firefox, Safari) o botão mostra aviso e o usuário digita o
 * código manualmente, como já fazia antes de existir esse componente.
 */
export function BarcodeScannerField({
  onScanned,
  disabled = false,
}: {
  onScanned: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"starting" | "live" | "unsupported" | "denied">("starting");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopScan = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const detectLoop = useCallback(() => {
    pollRef.current = setInterval(async () => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || video.readyState < 2) return;
      try {
        const results = await detector.detect(video);
        if (results.length > 0) {
          const value = results[0].rawValue;
          stopScan();
          setOpen(false);
          setStatus("starting");
          onScanned(value);
        }
      } catch {
        // Frame ilegível (fora de foco, em transição) — ignora e tenta o próximo.
      }
    }, 300);
  }, [onScanned, stopScan]);

  // Promise (não async/await) de propósito: o corpo só roda dentro do
  // `.then`/`.catch`, nunca sincronamente na chamada — evita disparar setState
  // direto durante a fase síncrona do efeito que a invoca (ver mesmo padrão
  // em `selfie-capture-field.tsx`).
  const start = useCallback(() => {
    if (!window.BarcodeDetector) {
      return Promise.resolve().then(() => setStatus("unsupported"));
    }
    detectorRef.current = new window.BarcodeDetector({ formats: FORMATS });
    return navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        setStatus("live");
      })
      .catch(() => setStatus("denied"));
  }, []);

  useEffect(() => {
    if (!open) return;
    start();
    return stopScan;
  }, [open, start, stopScan]);

  useEffect(() => {
    if (status === "live" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
      detectLoop();
    }
  }, [status, detectLoop]);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        fullWidth={false}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="gap-1.5 px-3"
      >
        <ScanLine className="size-4" />
        Escanear
      </Button>

      <Dialog
        open={open}
        onClose={() => {
          stopScan();
          setOpen(false);
          setStatus("starting");
        }}
        title="Escanear código de barras / QR"
        description="Aponte a câmera para o código do produto."
      >
        {status === "starting" && (
          <p className="py-6 text-center text-sm text-slate-500">Iniciando câmera...</p>
        )}

        {status === "live" && (
          <div className="relative mx-auto aspect-video w-full overflow-hidden rounded-lg bg-slate-900">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
          </div>
        )}

        {status === "unsupported" && (
          <FormBanner
            message="Seu navegador não suporta leitura automática de código de barras. Use Chrome (desktop ou Android) ou digite o código manualmente."
            variant="error"
          />
        )}

        {status === "denied" && (
          <FormBanner
            message="Não foi possível acessar a câmera. Verifique a permissão do navegador ou digite o código manualmente."
            variant="error"
          />
        )}
      </Dialog>
    </>
  );
}
