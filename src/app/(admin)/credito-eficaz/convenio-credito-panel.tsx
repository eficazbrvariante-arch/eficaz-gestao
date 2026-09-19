"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FormBanner } from "@/components/ui/form-banner";
import { formatBRL, formatDate } from "@/lib/format";
import { buildCreditoEficazInstallments } from "@/modules/credito-eficaz/credito-eficaz-surcharge";
import type { ConvenioCreditPanel } from "@/modules/credito-eficaz/convenio-credit-service";
import { updateConvenioCreditPolicyAction, runCreditoEficazCampaignAction } from "./actions";

/**
 * Chave mestre e parâmetros do crédito automático de cada convênio. Nasce
 * tudo OFFLINE: enquanto a chave estiver desligada, nenhuma concessão
 * acontece e nenhum cliente existente é alterado. Ligar aplica a regra a
 * quem já está aprovado E aos futuros — a tela diz na hora quantos
 * receberam.
 */
export function ConvenioCreditoPanel({ panels }: { panels: ConvenioCreditPanel[] }) {
  if (panels.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Nenhum convênio ativo cadastrado. Crie um convênio para poder liberar crédito automático aos
        colaboradores dele.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {panels.map((panel) => (
        <ConvenioCard key={panel.convenioId} panel={panel} />
      ))}
    </div>
  );
}

function ConvenioCard({ panel }: { panel: ConvenioCreditPanel }) {
  const [form, setForm] = useState({
    defaultLimitAmount: String(panel.policy.defaultLimitAmount),
    surchargePercent: String(panel.policy.surchargePercent),
    installmentCount: String(panel.policy.installmentCount),
    installmentIntervalDays: String(panel.policy.installmentIntervalDays),
    bonusPercent: String(panel.policy.bonusPercent),
    autoLimitCap: String(panel.policy.autoLimitCap),
    campaignDayOfMonth: String(panel.policy.campaignDayOfMonth),
  });
  const [enabled, setEnabled] = useState(panel.policy.enabled);
  const [bonusEnabled, setBonusEnabled] = useState(panel.policy.bonusEnabled);
  const [blockOnOverdue, setBlockOnOverdue] = useState(panel.policy.blockOnOverdue);
  const [campaignEnabled, setCampaignEnabled] = useState(panel.policy.campaignEnabled);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();

  function save(overrides: Record<string, unknown> = {}) {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await updateConvenioCreditPolicyAction(panel.convenioId, {
        enabled,
        bonusEnabled,
        blockOnOverdue,
        campaignEnabled,
        defaultLimitAmount: Number(form.defaultLimitAmount),
        surchargePercent: Number(form.surchargePercent),
        installmentCount: Number(form.installmentCount),
        installmentIntervalDays: Number(form.installmentIntervalDays),
        bonusPercent: Number(form.bonusPercent),
        autoLimitCap: Number(form.autoLimitCap),
        campaignDayOfMonth: Number(form.campaignDayOfMonth),
        ...overrides,
      });
      setFeedback(
        result.error
          ? { type: "error", message: result.error }
          : { type: "success", message: result.success! }
      );
    });
  }

  function toggleMaster() {
    const next = !enabled;
    setEnabled(next);
    save({ enabled: next });
  }

  // Simulação da compra, com os números que o cliente vê antes de confirmar
  // — a mesma função pura que o PDV e a venda usam de verdade.
  const exampleTotal = Number(form.defaultLimitAmount) || 0;
  const examplePercent = Number(form.surchargePercent) || 0;
  const exampleOwed = Math.round(exampleTotal * (1 + examplePercent / 100) * 100) / 100;
  const exampleInstallments = buildCreditoEficazInstallments(
    exampleOwed,
    Math.max(1, Number(form.installmentCount) || 1),
    Math.max(1, Number(form.installmentIntervalDays) || 30),
    new Date()
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Crédito Automático — Convênio {panel.convenioName}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {panel.activeMembers} colaborador(es) aprovado(s) · {panel.eligibleMembers} com cadastro de
            cliente · {panel.creditCustomers} já com limite deste convênio
            {panel.enabledAt && ` · ligado desde ${formatDate(panel.enabledAt)}`}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleMaster}
          disabled={isPending}
          aria-pressed={enabled}
          className={
            "flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors " +
            (enabled
              ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
              : "border-slate-400 bg-slate-100 text-slate-700 hover:bg-slate-200")
          }
        >
          <span
            className={"h-2 w-2 rounded-full " + (enabled ? "bg-white" : "bg-slate-500")}
            aria-hidden="true"
          />
          {isPending ? "Salvando..." : enabled ? "ONLINE" : "OFFLINE"}
        </button>
      </div>

      {!enabled && (
        <p className="mb-4 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          Desligado: nenhuma concessão automática acontece e nenhum cliente existente é alterado. O
          Crédito Eficaz normal continua funcionando como sempre. Quem já recebeu limite antes continua
          com ele — desligar nunca retira limite, dívida ou histórico.
        </p>
      )}

      {panel.membersWithoutCustomer > 0 && (
        <p className="mb-4 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
          {panel.membersWithoutCustomer} colaborador(es) aprovado(s) não têm cadastro de cliente (foram
          cadastrados manualmente, sem login na loja) — o crédito automático não alcança essas pessoas. Se
          quiser dar limite a elas, cadastre o cliente e conceda pelo fluxo normal.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumberField
          label="Limite inicial (R$)"
          value={form.defaultLimitAmount}
          onChange={(v) => setForm({ ...form, defaultLimitAmount: v })}
          step="0.01"
        />
        <NumberField
          label="Acréscimo (%)"
          value={form.surchargePercent}
          onChange={(v) => setForm({ ...form, surchargePercent: v })}
          step="0.5"
        />
        <NumberField
          label="Parcelas"
          value={form.installmentCount}
          onChange={(v) => setForm({ ...form, installmentCount: v })}
          step="1"
        />
        <NumberField
          label="Intervalo (dias)"
          value={form.installmentIntervalDays}
          onChange={(v) => setForm({ ...form, installmentIntervalDays: v })}
          step="1"
        />
      </div>

      {exampleTotal > 0 && (
        <p className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          Como fica uma compra de {formatBRL(exampleTotal)}: acréscimo de{" "}
          {formatBRL(exampleOwed - exampleTotal)}, total de <strong>{formatBRL(exampleOwed)}</strong> em{" "}
          {exampleInstallments.length}×{" "}
          {exampleInstallments
            .map((i) => `${formatBRL(i.amount)} em ${formatDate(i.dueDate)}`)
            .join(" + ")}
          .
        </p>
      )}

      <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
        <SwitchRow
          label="Aumento Automático de Limite por Pontualidade"
          description="Cada parcela paga em dia aumenta o limite total do cliente de forma permanente. Atraso recompõe o limite normalmente, mas nunca gera bônus."
          checked={bonusEnabled}
          onChange={(next) => {
            setBonusEnabled(next);
            save({ bonusEnabled: next });
          }}
          disabled={isPending}
        />
        {bonusEnabled && (
          <div className="grid grid-cols-2 gap-3 pl-1 sm:grid-cols-4">
            <NumberField
              label="Bônus (% da parcela)"
              value={form.bonusPercent}
              onChange={(v) => setForm({ ...form, bonusPercent: v })}
              step="1"
            />
            <NumberField
              label="Teto automático (R$)"
              value={form.autoLimitCap}
              onChange={(v) => setForm({ ...form, autoLimitCap: v })}
              step="0.01"
            />
            <p className="col-span-2 self-end text-xs text-slate-500">
              O teto para só o crescimento automático. O Admin continua podendo conceder limite acima
              disso manualmente.
            </p>
          </div>
        )}

        <SwitchRow
          label="Bloquear novas compras com parcela vencida"
          description="Enquanto houver parcela vencida em aberto, novas utilizações são recusadas. O limite não é apagado nem reduzido — volta a valer assim que regularizar."
          checked={blockOnOverdue}
          onChange={(next) => {
            setBlockOnOverdue(next);
            save({ blockOnOverdue: next });
          }}
          disabled={isPending}
        />

        <SwitchRow
          label="Campanha mensal de pontualidade"
          description="Estrutura preparada e desligada. Por envolver promoção/sorteio, só registra quem cumpriu os critérios — não sorteia, não premia e não roda sozinha. Ligue apenas depois da validação administrativa/jurídica das regras."
          checked={campaignEnabled}
          onChange={(next) => {
            setCampaignEnabled(next);
            save({ campaignEnabled: next });
          }}
          disabled={isPending}
        />
        {campaignEnabled && (
          <CampaignRow
            convenioId={panel.convenioId}
            dayOfMonth={form.campaignDayOfMonth}
            onDayChange={(v) => setForm({ ...form, campaignDayOfMonth: v })}
          />
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          fullWidth={false}
          disabled={isPending}
          onClick={() => save()}
          className="px-4"
        >
          Salvar configuração
        </Button>
        {enabled && (
          <span className="text-xs text-slate-500">
            Salvar com a chave ONLINE também concede o limite a quem ainda não recebeu.
          </span>
        )}
      </div>

      {feedback && (
        <div className="mt-3">
          <FormBanner message={feedback.message} variant={feedback.type} />
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step: string;
}) {
  const id = `ce-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" min={0} step={step} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        disabled={disabled}
        aria-pressed={checked}
        className={
          "shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors " +
          (checked
            ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
            : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50")
        }
      >
        {checked ? "ONLINE" : "OFFLINE"}
      </button>
    </div>
  );
}

/** Apuração manual da campanha — nunca automática, nunca sorteio. */
function CampaignRow({
  convenioId,
  dayOfMonth,
  onDayChange,
}: {
  convenioId: string;
  dayOfMonth: string;
  onDayChange: (value: string) => void;
}) {
  const now = new Date();
  const [referenceMonth, setReferenceMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();

  function run() {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await runCreditoEficazCampaignAction({ convenioId, referenceMonth });
      setFeedback(
        result.error
          ? { type: "error", message: result.error }
          : { type: "success", message: result.success! }
      );
    });
  }

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumberField label="Dia da apuração" value={dayOfMonth} onChange={onDayChange} step="1" />
        <div>
          <Label htmlFor="ce-campaign-month">Mês de referência</Label>
          <Input
            id="ce-campaign-month"
            type="month"
            value={referenceMonth}
            onChange={(e) => setReferenceMonth(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          fullWidth={false}
          disabled={isPending}
          onClick={run}
          className="mt-5 h-fit px-4"
        >
          Apurar elegíveis
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Uma participação por cliente, sempre. O número de chances nunca aumenta com o valor da dívida, o
        valor comprado, o número de parcelas ou o limite disponível — premiar pontualidade, não
        endividamento.
      </p>
      {feedback && (
        <div className="mt-2">
          <FormBanner message={feedback.message} variant={feedback.type} />
        </div>
      )}
    </div>
  );
}
