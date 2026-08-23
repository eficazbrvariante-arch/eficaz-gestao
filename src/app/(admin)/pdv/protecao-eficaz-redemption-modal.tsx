"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormBanner } from "@/components/ui/form-banner";
import { formatDate } from "@/lib/format";
import { validateProtecaoEficazRedemptionAction } from "./actions";
import type { ProtecaoEficazRedemptionCredential } from "@/modules/protecao-eficaz/protecao-eficaz-service";

/**
 * Valida a troca gratuita de uma Proteção Eficaz aprovada — mesmo padrão do
 * `ConvenioModal`: digita o número da venda original, o servidor confirma
 * que está aprovada/dentro do prazo/ainda não trocada, e mostra o nome do
 * cliente pro vendedor confirmar antes de aplicar.
 */
export function ProtecaoEficazRedemptionModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (credential: ProtecaoEficazRedemptionCredential) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [saleNumber, setSaleNumber] = useState("");
  const [error, setError] = useState<string>();
  const [resolved, setResolved] = useState<ProtecaoEficazRedemptionCredential | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => {
      setSaleNumber("");
      setError(undefined);
      setResolved(null);
      inputRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(timeout);
  }, [open]);

  function handleValidate() {
    const parsed = Number(saleNumber);
    if (!parsed || parsed <= 0) return;
    setError(undefined);
    startTransition(async () => {
      const result = await validateProtecaoEficazRedemptionAction(parsed);
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
      title="Troca — Proteção Eficaz"
      description={
        resolved
          ? "Confirme que é essa venda antes de aplicar — a película do carrinho fica grátis."
          : "Digite o número da venda original (a do cadastro aprovado)."
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
              disabled={isPending || !saleNumber.trim()}
              onClick={handleValidate}
            >
              {isPending ? "Validando..." : "Validar"}
            </Button>
          </>
        )
      }
    >
      <FormBanner message={error} variant="error" />

      {resolved ? (
        <div>
          <p className="text-base font-semibold text-foreground">{resolved.customerName}</p>
          <p className="text-sm text-text-muted">Venda original #{resolved.saleNumber}</p>
          <p className="mt-1 text-sm font-medium text-emerald-700">
            Válido para troca até {formatDate(resolved.protectionExpiresAt)}
          </p>
          <p className="mt-2 text-xs text-text-muted">
            Precisa ter exatamente 1 película no carrinho — ela sai com o valor zerado ao
            finalizar.
          </p>
        </div>
      ) : (
        <Input
          ref={inputRef}
          type="number"
          min={1}
          value={saleNumber}
          onChange={(e) => setSaleNumber(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleValidate();
            }
          }}
          placeholder="Número da venda, ex.: 123"
          disabled={isPending}
        />
      )}
    </Dialog>
  );
}
