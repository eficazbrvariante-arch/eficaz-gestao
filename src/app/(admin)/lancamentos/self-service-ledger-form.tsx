"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FormBanner } from "@/components/ui/form-banner";
import { SelfieCaptureField } from "@/components/ui/selfie-capture-field";
import { formatBRL } from "@/lib/format";
import {
  EMPLOYEE_LEDGER_TYPE_LABELS,
  EMPLOYEE_PURCHASE_DISCOUNT_PERCENT,
  employeePurchaseNetAmount,
  SELF_SERVICE_EMPLOYEE_LEDGER_TYPES,
} from "@/lib/validations/employee-ledger";
import type { ActiveEmployeeOption } from "../ponto/actions";
import { createSelfServiceLedgerEntryAction } from "./actions";

type SelfServiceType = (typeof SELF_SERVICE_EMPLOYEE_LEDGER_TYPES)[number];

export function SelfServiceLedgerForm({ employees }: { employees: ActiveEmployeeOption[] }) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [userId, setUserId] = useState("");
  const [type, setType] = useState<SelfServiceType>("PURCHASE");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  // Troca a `key` do campo de selfie depois de cada lançamento, pra ele
  // reabrir a câmera do zero em vez de mostrar a foto anterior.
  const [selfieKey, setSelfieKey] = useState(0);

  const ready = userId !== "" && Number(amount) > 0 && description.trim() !== "";

  function submit(selfieUrl: string) {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await createSelfServiceLedgerEntryAction({
        userId,
        type,
        amount: Number(amount),
        description,
        selfieUrl,
      });
      setSelfieKey((key) => key + 1);
      if ("error" in result) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setFeedback({ type: "success", message: result.success });
      setUserId("");
      setType("PURCHASE");
      setAmount("");
      setDescription("");
    });
  }

  return (
    <div className="space-y-4">
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <Label htmlFor="lancamento-colaborador">Seu nome</Label>
          <Select
            id="lancamento-colaborador"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            disabled={isPending}
          >
            <option value="">Selecione quem está lançando</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="lancamento-tipo">O que você pegou</Label>
          <Select
            id="lancamento-tipo"
            value={type}
            onChange={(e) => setType(e.target.value as SelfServiceType)}
            disabled={isPending}
          >
            {SELF_SERVICE_EMPLOYEE_LEDGER_TYPES.map((value) => (
              <option key={value} value={value}>
                {EMPLOYEE_LEDGER_TYPE_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="lancamento-valor">
            {type === "PURCHASE" ? "Preço do produto (R$)" : "Valor (R$)"}
          </Label>
          <Input
            id="lancamento-valor"
            type="number"
            step="0.01"
            min={0}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isPending}
          />
          {type === "PURCHASE" && Number(amount) > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              Com {EMPLOYEE_PURCHASE_DISCOUNT_PERCENT}% de desconto de colaborador, você paga{" "}
              <span className="font-semibold text-slate-700">
                {formatBRL(employeePurchaseNetAmount(Number(amount)))}
              </span>
              .
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="lancamento-descricao">Descrição</Label>
          <Input
            id="lancamento-descricao"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={type === "PURCHASE" ? "Ex.: cabo USB-C, película" : "Ex.: vale para almoço"}
            disabled={isPending}
          />
        </div>
      </div>

      {ready ? (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">
            Selfie obrigatória — tire a foto para confirmar o lançamento.
          </p>
          <SelfieCaptureField
            key={selfieKey}
            cameraOnly
            disabled={isPending}
            onCaptured={submit}
          />
        </div>
      ) : (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
          Preencha seu nome, o valor e a descrição para liberar a selfie.
        </p>
      )}
    </div>
  );
}
