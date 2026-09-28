"use client";

import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormBanner } from "@/components/ui/form-banner";
import { formatBRL } from "@/lib/format";
import { setInitialPriceAction } from "./actions";

/**
 * Produto cadastrado sem preço (R$ 0,00) passou no caixa: o Gerente/Admin
 * define o preço de venda aqui, uma vez só — ele fica gravado no cadastro e o
 * produto entra no carrinho já com esse preço. Depois disso, o preço só muda
 * pela tela do produto (ver `setInitialProductPrice`).
 */
export function InitialPriceModal({
  product,
  onClose,
  onPriceSet,
}: {
  product: { id: string; name: string } | null;
  onClose: () => void;
  onPriceSet: (price: number) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const price = Number(value.replace(",", "."));
  const valid = Number.isFinite(price) && price > 0;

  function close() {
    setValue("");
    setError(undefined);
    onClose();
  }

  function submit() {
    if (!product || !valid) {
      setError("Informe um preço maior que zero.");
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await setInitialPriceAction(product.id, price);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setValue("");
      onPriceSet(result.price);
    });
  }

  return (
    <Dialog
      open={product !== null}
      onClose={close}
      title="Produto sem preço"
      description="Defina o preço de venda. Ele fica gravado no cadastro e não pode ser alterado pelo PDV depois."
      footer={
        <>
          <Button type="button" variant="secondary" fullWidth={false} onClick={close}>
            Cancelar
          </Button>
          <Button type="button" fullWidth={false} disabled={isPending || !valid} onClick={submit}>
            {isPending ? "Salvando..." : valid ? `Definir ${formatBRL(price)}` : "Definir preço"}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm font-medium text-foreground">{product?.name}</p>
      <FormBanner message={error} variant="error" />
      <Label htmlFor="initial-price">Preço de venda (R$)</Label>
      <Input
        id="initial-price"
        type="number"
        inputMode="decimal"
        step="0.01"
        min={0}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <p className="mt-2 text-xs text-text-muted">
        Confira antes de confirmar: depois, só dá para mudar pela tela do produto.
      </p>
    </Dialog>
  );
}
