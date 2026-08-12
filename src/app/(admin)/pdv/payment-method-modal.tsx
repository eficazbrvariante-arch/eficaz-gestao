"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clsx } from "@/lib/clsx";
import { formatBRL } from "@/lib/format";

export type PaymentMethod = "CASH" | "PIX" | "DEBIT" | "CREDIT" | "STORE_CREDIT" | "FIADO";

type MethodOption = { key: string; label: string; method: PaymentMethod };

/** Ordem fixa dos métodos "base" — sempre disponíveis, independente de cliente. */
const BASE_OPTIONS: MethodOption[] = [
  { key: "cash", label: "Dinheiro", method: "CASH" },
  { key: "credit", label: "Cartão de Crédito", method: "CREDIT" },
  { key: "debit", label: "Cartão de Débito", method: "DEBIT" },
  { key: "pix_key", label: "Chave PIX", method: "PIX" },
  { key: "pix_machine", label: "Pix Maquininha", method: "PIX" },
  { key: "mercado_pago", label: "Mercado Pago", method: "PIX" },
];

/**
 * Escolha de forma de pagamento de uma parcela — grade de métodos + valor,
 * inspirado no fluxo do concorrente "Next PDV". Chave PIX / Pix Maquininha /
 * Mercado Pago são só rótulos: todos gravam `method: "PIX"` (decisão do
 * usuário — sem migração de banco, ver plano da sessão).
 *
 * O formulário interno é remontado via `key={resetKey}` (nonce incrementado
 * pelo pai a cada abertura) em vez de resetado por `useEffect`: evita o
 * "flash" de um frame com o estado da abertura anterior antes do reset
 * rodar (o `Dialog` filho chama `showModal()` no seu próprio efeito, que
 * comita antes de um efeito de reset aqui).
 */
export function PaymentMethodModal({
  open,
  onClose,
  remaining,
  hasCustomer,
  customerCreditBalance,
  canFiado,
  resetKey,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  /** Quanto ainda falta pagar — sugestão inicial do valor da parcela. */
  remaining: number;
  hasCustomer: boolean;
  customerCreditBalance: number;
  canFiado: boolean;
  resetKey: number;
  onConfirm: (payment: { method: PaymentMethod; label: string; amount: number }) => void;
}) {
  const options: MethodOption[] = [
    ...BASE_OPTIONS,
    ...(hasCustomer && customerCreditBalance > 0
      ? [{ key: "store_credit", label: "Crédito de loja", method: "STORE_CREDIT" as PaymentMethod }]
      : []),
    ...(canFiado && hasCustomer
      ? [{ key: "fiado", label: "Fiado", method: "FIADO" as PaymentMethod }]
      : []),
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Forma de pagamento"
      description="Escolha o método e o valor desta parcela."
      className="max-w-lg"
      footer={
        <Button type="button" variant="secondary" fullWidth={false} onClick={onClose}>
          Cancelar
        </Button>
      }
    >
      <PaymentMethodForm key={resetKey} options={options} remaining={remaining} onConfirm={onConfirm} />
    </Dialog>
  );
}

/** Remontado a cada abertura do modal — nasce direto com o estado certo. */
function PaymentMethodForm({
  options,
  remaining,
  onConfirm,
}: {
  options: MethodOption[];
  remaining: number;
  onConfirm: (payment: { method: PaymentMethod; label: string; amount: number }) => void;
}) {
  const [selectedKey, setSelectedKey] = useState(options[0]?.key ?? "cash");
  const [amount, setAmount] = useState(Math.max(0, remaining));

  const selected = options.find((option) => option.key === selectedKey) ?? options[0];

  return (
    <div>
      <Label htmlFor="payment-amount">Valor desta parcela (R$)</Label>
      <Input
        id="payment-amount"
        type="number"
        step="0.01"
        min={0}
        autoFocus
        value={amount || ""}
        onChange={(e) => setAmount(Number(e.target.value) || 0)}
        className="mb-4 text-right text-lg font-semibold"
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const isSelected = option.key === selectedKey;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelectedKey(option.key)}
              className={clsx(
                "rounded-xl border p-3 text-center text-sm font-medium transition-colors",
                isSelected
                  ? "border-slate-900 bg-slate-50 text-slate-900"
                  : "border-slate-200 text-slate-700 hover:border-slate-400"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <Button
        type="button"
        className="mt-4"
        disabled={amount <= 0 || !selected}
        onClick={() => selected && onConfirm({ method: selected.method, label: selected.label, amount })}
      >
        Adicionar {formatBRL(amount)}
      </Button>
    </div>
  );
}
