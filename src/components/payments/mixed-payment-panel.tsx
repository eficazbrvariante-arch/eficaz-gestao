"use client";

import { clsx } from "@/lib/clsx";
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
  dense = false,
}: {
  slots: PaymentPanelSlot[];
  amounts: Record<string, number>;
  total: number;
  onChangeAmount: (key: string, amount: number) => void;
  /** Desabilita a lista inteira (ex.: vendedor ainda não selecionado). */
  disabled?: boolean;
  /**
   * Formas disponíveis em duas colunas, com botões mais baixos — usado só no
   * PDV, onde as 8 formas empilhadas ocupavam quase 450px de altura e
   * empurravam o "Finalizar venda" pra fora da tela. A área de toque continua
   * confortável (44px). Desligado por padrão: a Assistência Técnica segue
   * exatamente com a lista vertical de sempre.
   */
  dense?: boolean;
}) {
  const paid = round2(slots.reduce((sum, slot) => sum + (amounts[slot.key] || 0), 0));
  const remaining = round2(total - paid);

  const activeSlots = slots.filter((slot) => (amounts[slot.key] || 0) > 0);
  const availableSlots = slots.filter((slot) => !((amounts[slot.key] || 0) > 0));

  return (
    <div className={dense ? "space-y-3" : "space-y-4"}>
      {remaining > 0.005 && (
        <div>
          <p className="mb-2 text-sm font-bold text-foreground">Forma de pagamento</p>
          <div className={dense ? "grid grid-cols-2 gap-2" : "space-y-2"}>
            {availableSlots.map((slot) => (
              <button
                key={slot.key}
                type="button"
                disabled={disabled || slot.disabled}
                title={slot.disabled ? slot.disabledReason : `Usar restante — ${formatBRL(remaining)}`}
                onClick={() => onChangeAmount(slot.key, remaining)}
                className={clsx(
                  // `display` sai de um lado só das duas opções: deixar `block`
                  // no trecho comum e `flex` no denso deixaria duas utilidades
                  // de display na mesma classe, e quem vence passaria a ser a
                  // ordem da folha de estilo, não a intenção aqui.
                  "w-full rounded-lg border border-border bg-surface text-left font-bold text-foreground hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface",
                  dense
                    ? "flex min-h-11 items-center px-3 py-2 text-sm leading-tight"
                    : "block px-4 py-3 text-base"
                )}
              >
                {slot.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeSlots.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-bold text-foreground">Pagamentos</p>
          <div className="space-y-2">
            {activeSlots.map((slot) => (
              <div
                key={slot.key}
                className={clsx(
                  "flex items-center gap-2 rounded-lg border border-border bg-surface-hover px-3",
                  dense ? "py-1.5" : "py-2.5"
                )}
              >
                <span
                  className={clsx(
                    "min-w-0 flex-1 truncate font-bold text-foreground",
                    dense ? "text-sm" : "text-base"
                  )}
                >
                  {slot.label}
                </span>
                <div className={clsx("relative shrink-0", dense ? "w-28" : "w-32")}>
                  <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-sm text-text-muted">
                    R$
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    disabled={disabled}
                    value={amounts[slot.key] || ""}
                    onChange={(e) => onChangeAmount(slot.key, Math.max(0, Number(e.target.value) || 0))}
                    className={clsx(
                      "money-input w-full rounded border border-border bg-surface py-1 pl-8 pr-2 text-right font-bold text-foreground disabled:bg-surface-hover",
                      dense ? "h-9 text-sm" : "h-10 text-base"
                    )}
                  />
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChangeAmount(slot.key, 0)}
                  aria-label={`Remover pagamento em ${slot.label}`}
                  title="Remover"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-text-muted hover:bg-danger/10 hover:text-danger disabled:pointer-events-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div
            className={clsx(
              "border-t border-border text-base",
              dense ? "mt-2 space-y-1 pt-2" : "mt-3 space-y-1.5 pt-3"
            )}
          >
            <div className="flex justify-between text-text-secondary">
              <span className="font-medium">Pago</span>
              <span className="font-bold text-foreground">{formatBRL(paid)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold">
              <span className="text-foreground">Restante</span>
              <span className={remaining > 0.005 ? "text-warning" : remaining < -0.005 ? "text-danger" : "text-success"}>
                {formatBRL(Math.abs(remaining))}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
