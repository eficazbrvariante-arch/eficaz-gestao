"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { findSaleByNumberAction } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FormBanner } from "@/components/ui/form-banner";

export function BuscarVendaForm() {
  const router = useRouter();
  const [numero, setNumero] = useState("");
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    startTransition(async () => {
      const result = await findSaleByNumberAction({ number: Number(numero) });
      if (result?.error) setError(result.error);
      else if (result?.saleId) router.push(`/vendas/${result.saleId}`);
    });
  };

  return (
    <form onSubmit={onSubmit}>
      <FormBanner message={error} variant="error" />

      <Label htmlFor="numero">Número do cupom</Label>
      <Input
        id="numero"
        inputMode="numeric"
        autoFocus
        placeholder="Ex.: 128"
        value={numero}
        onChange={(event) => setNumero(event.target.value.replace(/\D/g, ""))}
      />

      <Button type="submit" disabled={isPending || !numero} fullWidth={false} className="mt-4 px-6">
        {isPending ? "Buscando..." : "Buscar venda"}
      </Button>
    </form>
  );
}
