"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import { validateConvenioCredentialAction } from "./actions";
import type { ConvenioCredential } from "@/modules/convenios/convenio-redemption-service";

/**
 * Escaneia (leitor físico já usado pro código de barras) ou digita o código
 * do QR do convênio, valida no servidor e — antes de aplicar o benefício —
 * mostra a foto e o nome pro vendedor confirmar visualmente que é essa
 * mesma pessoa (a credencial só prova posse do QR, não identidade).
 */
export function ConvenioModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (credential: ConvenioCredential) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [resolved, setResolved] = useState<ConvenioCredential | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    // Reseta e foca dentro do timeout (nunca sincronamente no corpo do
    // efeito) — o leitor físico digita no campo focado e aperta Enter
    // sozinho, então o foco precisa estar pronto assim que o modal abre.
    const timeout = window.setTimeout(() => {
      setCode("");
      setError(undefined);
      setResolved(null);
      inputRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(timeout);
  }, [open]);

  function handleValidate() {
    if (!code.trim()) return;
    setError(undefined);
    startTransition(async () => {
      const result = await validateConvenioCredentialAction(code);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setResolved(result);
    });
  }

  function handleConfirm() {
    if (!resolved) return;
    onConfirm(resolved);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Convênio corporativo"
      description={
        resolved
          ? "Confira se é essa mesma pessoa antes de aplicar."
          : "Escaneie o QR, ou digite o código de 6 dígitos do colaborador."
      }
      footer={
        resolved ? (
          <>
            <Button type="button" variant="secondary" fullWidth={false} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" variant="brand" fullWidth={false} onClick={handleConfirm}>
              Confirmar e aplicar
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="secondary" fullWidth={false} onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="brand"
              fullWidth={false}
              disabled={isPending || !code.trim()}
              onClick={handleValidate}
            >
              {isPending ? "Validando..." : "Validar"}
            </Button>
          </>
        )
      }
    >
      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {resolved ? (
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- selfie em blob storage, domínio variável */}
          <img
            src={resolved.member.selfieUrl}
            alt={resolved.member.name}
            className="h-20 w-20 shrink-0 rounded-full object-cover"
          />
          <div>
            <p className="text-base font-semibold text-slate-900">{resolved.member.name}</p>
            <p className="text-sm text-slate-500">Convênio {resolved.convenio.name}</p>
            <p className="mt-1 text-sm font-medium text-emerald-700">
              Benefício: {formatBRL(resolved.benefitAmount)}
            </p>
          </div>
        </div>
      ) : (
        <input
          ref={inputRef}
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleValidate();
            }
          }}
          placeholder="Código de 6 dígitos, QR ou link"
          disabled={isPending}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      )}
    </Dialog>
  );
}
