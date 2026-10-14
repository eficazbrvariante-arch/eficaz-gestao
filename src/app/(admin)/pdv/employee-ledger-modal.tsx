"use client";

import { Dialog } from "@/components/ui/dialog";
import type { ActiveEmployeeOption } from "../ponto/actions";
import { SelfServiceLedgerForm } from "../lancamentos/self-service-ledger-form";

/**
 * Lançamento de mercadoria/adiantamento do colaborador sem sair do PDV —
 * mesmo formulário de `/lancamentos` (nome + valor + selfie obrigatória), só
 * que dentro de um modal pra o vendedor lançar por conta própria no balcão.
 */
export function EmployeeLedgerModal({
  open,
  onClose,
  employees,
}: {
  open: boolean;
  onClose: () => void;
  employees: ActiveEmployeeOption[];
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Lançamento do colaborador"
      description="Pegou algum produto ou adiantamento da loja? Selecione o seu nome, informe o valor e tire uma selfie. O valor é descontado no seu próximo pagamento."
    >
      {/* Remonta a cada abertura: o formulário começa limpo, sem o aviso nem a
          selfie do lançamento anterior. */}
      {open && <SelfServiceLedgerForm employees={employees} />}
    </Dialog>
  );
}
