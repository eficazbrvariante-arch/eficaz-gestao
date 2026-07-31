"use client";

import { useState, useTransition } from "react";
import { saveDomainAction, verifyDomainAction, removeDomainAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FormBanner } from "@/components/ui/form-banner";

type Feedback = { type: "success" | "error"; message: string } | undefined;

export function DomainForm({ currentDomain }: { currentDomain: string | null }) {
  const [domain, setDomain] = useState(currentDomain ?? "");
  const [feedback, setFeedback] = useState<Feedback>();
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setFeedback(undefined);
    startTransition(async () => {
      const result = await saveDomainAction({ domain });
      if (result?.error) setFeedback({ type: "error", message: result.error });
      else setFeedback({ type: "success", message: result?.success ?? "Salvo." });
    });
  }

  return (
    <form onSubmit={submit} noValidate>
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="mb-4">
        <Label htmlFor="domain">Seu domínio</Label>
        <Input
          id="domain"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="minhaloja.com.br"
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-slate-400">
          Digite sem <code>http://</code> e sem barras. Você precisa já ter comprado este
          domínio em um registrador (Registro.br, GoDaddy, Hostinger...).
        </p>
      </div>

      <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
        {isPending ? "Salvando..." : currentDomain ? "Atualizar domínio" : "Conectar domínio"}
      </Button>
    </form>
  );
}

export function VerifyDomainButton() {
  const [feedback, setFeedback] = useState<Feedback>();
  const [isPending, startTransition] = useTransition();

  function verify() {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await verifyDomainAction();
      if (result?.error) setFeedback({ type: "error", message: result.error });
      else setFeedback({ type: "success", message: result?.success ?? "Verificado." });
    });
  }

  return (
    <div>
      <FormBanner message={feedback?.message} variant={feedback?.type} />
      <Button
        type="button"
        onClick={verify}
        disabled={isPending}
        fullWidth={false}
        className="px-6"
      >
        {isPending ? "Verificando..." : "Verificar agora"}
      </Button>
      <p className="mt-2 text-xs text-slate-400">
        A propagação do DNS costuma levar de alguns minutos a algumas horas. Se não funcionar
        de primeira, aguarde e tente de novo.
      </p>
    </div>
  );
}

export function RemoveDomainButton() {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm text-red-600 hover:underline"
      >
        Remover domínio
      </button>
    );
  }

  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3">
      <p className="mb-2 text-sm text-red-900">
        A loja deixará de responder por este domínio e voltará a atender só pelo subdomínio.
        Os registros de DNS que você criou continuam existindo e podem ser apagados no
        registrador.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(async () => { await removeDomainAction(); })}
          className="rounded-md bg-red-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-800"
        >
          {isPending ? "Removendo..." : "Confirmar remoção"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-sm text-slate-700"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
