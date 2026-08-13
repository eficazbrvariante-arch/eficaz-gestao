"use client";

import { formatBRL } from "@/lib/format";

export type PaymentPanelSlot = {
  key: string;
  label: string;
  disabled?: boolean;
  /** Mostrado como `title` do botão quando `disabled` — ex. "Selecione um cliente elegível para fiado". */
  disabledReason?: string;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Lista vertical de formas de pagamento — usada tanto no PDV quanto no
 * acerto financeiro da entrega de OS (pedido explícito: mesma interação nos
 * dois lugares, sem duas implementações paralelas do "pagamento misto").
 *
 * Fica em dois estados por forma de pagamento: "disponível" (um botão pra
 * ativar, já preenchendo com o valor que falta — "usar restante") e "ativa"
 * (uma linha com valor editável e um botão pra remover). O caller só recebe
 * `onChangeAmount(key, amount)` — passar `0` remove a linha.
 */
export function MixedPaymentPanel({
  slots,
  amounts,
  total,
  onChangeAmount,
  disabled = false,
}: {
  slots: PaymentPanelSlot[];
  amounts: Record<string, number>;
  total: number;
  onChangeAmount: (key: string, amount: number) => void;
  /** Desabilita a lista inteira (ex.: vendedor ainda não selecionado). */
  disabled?: boolean;
}) {
  const paid = round2(slots.reduce((sum, slot) => sum + (amounts[slot.key] || 0), 0));
  const remaining = round2(total - paid);

  const activeSlots = slots.filter((slot) => (amounts[slot.key] || 0) > 0);
  const availableSlots = slots.filter((slot) => !((amounts[slot.key] || 0) > 0));

  return (
    <div className="space-y-4">
      {remaining > 0.005 && (
        <div>
          <p className="mb-2 text-sm font-bold text-black">Forma de pagamento</p>
          <div className="space-y-2">
            {availableSlots.map((slot) => (
              <button
                key={slot.key}
                type="button"
                disabled={disabled || slot.disabled}
                title={slot.disabled ? slot.disabledReason : `Usar restante — ${formatBRL(remaining)}`}
                onClick={() => onChangeAmount(slot.key, remaining)}
                className="block w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-left text-base font-bold text-black hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300 disabled:hover:bg-white"
              >
                {slot.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeSlots.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-bold text-black">Pagamentos</p>
          <div className="space-y-2">
            {activeSlots.map((slot) => (
              <div
                key={slot.key}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-base font-bold text-black">
                  {slot.label}
                </span>
                <div className="relative w-32 shrink-0">
                  <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-sm text-slate-500">
                    R$
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    disabled={disabled}
                    value={amounts[slot.key] || ""}
                    onChange={(e) => onChangeAmount(slot.key, Math.max(0, Number(e.target.value) || 0))}
                    className="money-input h-10 w-full rounded border border-slate-300 py-1 pl-8 pr-2 text-right text-base font-bold text-black disabled:bg-slate-100"
                  />
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChangeAmount(slot.key, 0)}
                  aria-label={`Remover pagamento em ${slot.label}`}
                  title="Remover"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 space-y-1.5 border-t border-slate-200 pt-3 text-base">
            <div className="flex justify-between text-slate-700">
              <span className="font-medium">Pago</span>
              <span className="font-bold text-black">{formatBRL(paid)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold">
              <span className="text-black">Restante</span>
              <span className={remaining > 0.005 ? "text-amber-600" : remaining < -0.005 ? "text-red-600" : "text-emerald-700"}>
                {formatBRL(Math.abs(remaining))}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
