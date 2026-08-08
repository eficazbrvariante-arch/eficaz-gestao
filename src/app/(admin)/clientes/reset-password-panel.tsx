"use client";

import { useState, useTransition } from "react";
import { adminSetCustomerPasswordAction, adminGenerateAndSendPasswordAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormBanner } from "@/components/ui/form-banner";

export function ResetCustomerPasswordPanel({
  customerId,
  hasLogin,
}: {
  customerId: string;
  hasLogin: boolean;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [isPending, startTransition] = useTransition();

  if (!hasLogin) {
    return (
      <p className="text-sm text-slate-500">
        Este cliente ainda não tem login na loja online (nunca criou conta com @usuário).
      </p>
    );
  }

  const handleSetPassword = () => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await adminSetCustomerPasswordAction(customerId, newPassword);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
      } else if (result?.success) {
        setFeedback({ type: "success", message: result.success });
        setNewPassword("");
      }
    });
  };

  const handleGenerateAndSend = () => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await adminGenerateAndSendPasswordAction(customerId);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
      } else if (result?.success) {
        window.open(result.whatsappLink, "_blank", "noopener,noreferrer");
        setFeedback({
          type: "success",
          message: 'Nova senha gerada. Envie a mensagem que abriu no WhatsApp.',
        });
      }
    });
  };

  return (
    <div className="space-y-4">
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div>
        <Label htmlFor="admin-new-password">Definir nova senha manualmente</Label>
        <div className="mt-1 flex gap-2">
          <Input
            id="admin-new-password"
            type="text"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Mínimo de 8 caracteres"
          />
          <button
            type="button"
            disabled={isPending || newPassword.length === 0}
            onClick={handleSetPassword}
            className="shrink-0 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>

      <div>
        <button
          type="button"
          disabled={isPending}
          onClick={handleGenerateAndSend}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Gerar senha nova e enviar pelo WhatsApp
        </button>
      </div>
    </div>
  );
}
