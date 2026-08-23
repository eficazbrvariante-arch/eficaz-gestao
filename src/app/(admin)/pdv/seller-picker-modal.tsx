"use client";

import { useEffect, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { nameInitials } from "@/lib/format";
import { listActiveSellersAction, type PdvSellerOption } from "./actions";

/**
 * "Quem realizou esta venda?" — intercepta o clique em "Finalizar venda"
 * enquanto não houver um vendedor escolhido. Cards grandes para toque, meta
 * de 2-3 segundos para escolher e seguir para o pagamento.
 */
export function SellerPickerModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (seller: PdvSellerOption) => void;
}) {
  const [sellers, setSellers] = useState<PdvSellerOption[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    startTransition(async () => {
      setSellers(await listActiveSellersAction());
    });
  }, [open, startTransition]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Quem realizou esta venda?"
      description="Selecione o vendedor para continuar para o pagamento."
      footer={
        <Button type="button" variant="secondary" fullWidth={false} onClick={onClose}>
          Cancelar
        </Button>
      }
    >
      {isPending ? (
        <p className="py-6 text-center text-sm text-text-muted">Carregando vendedores...</p>
      ) : sellers.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">
          Nenhum vendedor ativo encontrado. Cadastre um vendedor em Usuários.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {sellers.map((seller) => (
            <button
              key={seller.id}
              type="button"
              onClick={() => onSelect(seller)}
              className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 text-center transition-colors hover:border-brand hover:bg-surface-hover"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-contrast">
                {nameInitials(seller.name)}
              </span>
              <span className="text-sm font-medium text-foreground">{seller.name}</span>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
