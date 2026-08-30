"use client";

import { Dialog } from "@/components/ui/dialog";
import { CashMovementForm } from "../caixa/cash-forms";

/**
 * Sangria/suprimento sem sair do PDV — mesmo formulário usado em `/caixa`
 * (ver `CashMovementForm`), só que dentro de um modal pra não interromper o
 * fluxo de venda. Fecha sozinho ao registrar com sucesso.
 */
export function CashMovementModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Sangria / Suprimento"
      description="Retire dinheiro do caixa (sangria) ou registre uma entrada (suprimento), com foto do comprovante se necessário."
    >
      <CashMovementForm onSuccess={onClose} />
    </Dialog>
  );
}
