"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clsx } from "@/lib/clsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormBanner } from "@/components/ui/form-banner";
import { MultiImageUploadField } from "@/components/ui/multi-image-upload-field";
import { formatBRL } from "@/lib/format";
import { searchCustomersAction } from "../clientes/actions";
import {
  createRepairOrderAction,
  updateRepairOrderAction,
  updateRepairOrderStatusAction,
} from "./actions";
import {
  REPAIR_ORDER_STATUSES,
  REPAIR_ORDER_STATUS_BADGE_CLASSES,
  REPAIR_ORDER_STATUS_LABELS,
  type RepairOrderStatusValue,
} from "@/lib/validations/repair-order";

type ServiceLine = {
  key: number;
  description: string;
  unitPrice: number;
  quantity: number;
};

type CustomerOption = {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
};

type HistoryEvent = { id: string; message: string; createdAt: string };

export type RepairOrderDefaults = {
  customer: CustomerOption | null;
  brand: string;
  model: string;
  color: string;
  imei: string;
  passcode: string;
  turnsOn: boolean;
  condition: string;
  reportedDefects: string;
  internalNotes: string;
  estimatedAt: string;
  discount: number;
  items: { description: string; unitPrice: number; quantity: number }[];
  photoUrls: string[];
};

/** Existe apenas ao editar uma OS já criada. */
export type RepairOrderMeta = {
  id: string;
  number: number;
  status: RepairOrderStatusValue;
  createdAt: string;
  updatedAt: string;
  pickedUpAt: string | null;
  events: HistoryEvent[];
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

let lineKeySeq = 0;
function toServiceLines(items: RepairOrderDefaults["items"]): ServiceLine[] {
  return items.map((item) => ({ ...item, key: lineKeySeq++ }));
}

export function RepairOrderWorkspace({
  defaults,
  meta,
}: {
  defaults: RepairOrderDefaults;
  meta?: RepairOrderMeta;
}) {
  const router = useRouter();
  const isEditing = Boolean(meta);

  const [customer, setCustomer] = useState<CustomerOption | null>(defaults.customer);
  const [customerTerm, setCustomerTerm] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);

  const [brand, setBrand] = useState(defaults.brand);
  const [model, setModel] = useState(defaults.model);
  const [color, setColor] = useState(defaults.color);
  const [imei, setImei] = useState(defaults.imei);
  const [passcode, setPasscode] = useState(defaults.passcode);
  const [turnsOn, setTurnsOn] = useState(defaults.turnsOn);
  const [condition, setCondition] = useState(defaults.condition);
  const [reportedDefects, setReportedDefects] = useState(defaults.reportedDefects);
  const [internalNotes, setInternalNotes] = useState(defaults.internalNotes);
  const [estimatedAt, setEstimatedAt] = useState(defaults.estimatedAt);
  const [discount, setDiscount] = useState(defaults.discount);
  const [items, setItems] = useState<ServiceLine[]>(() => toServiceLines(defaults.items));
  const [photoUrls, setPhotoUrls] = useState<string[]>(defaults.photoUrls);

  const [status, setStatus] = useState<RepairOrderStatusValue>(meta?.status ?? "RECEIVED");

  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const [isUpdatingStatus, startStatusTransition] = useTransition();
  const [, startSearchTransition] = useTransition();
  const searchTimeout = useRef<number | undefined>(undefined);

  const servicesTotal = round2(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  const totalWithDiscount = round2(Math.max(0, servicesTotal - discount));

  function searchCustomers(term: string) {
    setCustomerTerm(term);
    window.clearTimeout(searchTimeout.current);
    if (term.trim().length < 2) {
      setCustomerResults([]);
      return;
    }
    searchTimeout.current = window.setTimeout(() => {
      setSearchingCustomer(true);
      startSearchTransition(async () => {
        const results = await searchCustomersAction(term);
        setCustomerResults(results);
        setSearchingCustomer(false);
      });
    }, 250);
  }

  function addServiceLine() {
    setItems((current) => [...current, { key: lineKeySeq++, description: "", unitPrice: 0, quantity: 1 }]);
  }

  function updateServiceLine(key: number, patch: Partial<ServiceLine>) {
    setItems((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeServiceLine(key: number) {
    setItems((current) => current.filter((line) => line.key !== key));
  }

  function buildInput() {
    return {
      customerId: customer?.id ?? "",
      brand,
      model,
      color,
      imei,
      passcode,
      turnsOn,
      condition,
      reportedDefects,
      internalNotes,
      estimatedAt,
      discount,
      items: items.map((line) => ({
        description: line.description,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
      })),
      photoUrls,
    };
  }

  function handleSave() {
    setError(undefined);
    setSuccess(undefined);

    if (!customer) {
      setError("Selecione ou cadastre um cliente antes de salvar.");
      return;
    }
    if (!brand.trim() || !model.trim()) {
      setError("Informe a marca e o modelo do aparelho.");
      return;
    }

    startTransition(async () => {
      if (isEditing && meta) {
        const result = await updateRepairOrderAction(meta.id, buildInput());
        if (result?.error) {
          setError(result.error);
        } else {
          setSuccess(result?.success ?? "Ordem de serviço salva.");
          router.refresh();
        }
      } else {
        const result = await createRepairOrderAction(buildInput());
        if (result?.error) setError(result.error);
        // Em caso de sucesso, a action redireciona — não há mais o que fazer aqui.
      }
    });
  }

  function handleClear() {
    setCustomer(null);
    setCustomerTerm("");
    setCustomerResults([]);
    setBrand("");
    setModel("");
    setColor("");
    setImei("");
    setPasscode("");
    setTurnsOn(true);
    setCondition("");
    setReportedDefects("");
    setInternalNotes("");
    setEstimatedAt("");
    setDiscount(0);
    setItems([]);
    setPhotoUrls([]);
    setError(undefined);
    setSuccess(undefined);
  }

  function handleStatusChange(next: RepairOrderStatusValue) {
    if (!meta) return;
    setStatus(next);
    startStatusTransition(async () => {
      const result = await updateRepairOrderStatusAction(meta.id, next);
      if (result?.error) {
        setError(result.error);
        setStatus(meta.status);
      } else {
        setSuccess(result?.success ?? "Status atualizado.");
        router.refresh();
      }
    });
  }

  function handleWhatsapp() {
    if (!customer?.phone) {
      setError("Este cliente não tem telefone cadastrado.");
      return;
    }
    const digits = customer.phone.replace(/\D/g, "");
    const lines = [
      `Orçamento da OS${meta ? ` #${String(meta.number).padStart(6, "0")}` : ""}`,
      `Aparelho: ${brand} ${model}`.trim(),
      "",
      "Serviços:",
      ...items.map((item) => `- ${item.description}: ${formatBRL(item.unitPrice * item.quantity)}`),
      "",
      `Total: ${formatBRL(totalWithDiscount)}`,
    ];
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(lines.join("\n"))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Assistência Técnica</h1>
          <p className="text-sm text-slate-500">
            {isEditing ? `OS #${String(meta!.number).padStart(6, "0")}` : "Nova ordem de serviço"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/assistencia-tecnica"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Voltar
          </Link>
          {!isEditing && (
            <Button type="button" variant="secondary" fullWidth={false} onClick={handleClear}>
              Limpar
            </Button>
          )}
          <Button type="button" fullWidth={false} disabled={isPending} onClick={handleSave} className="px-6">
            {isPending ? "Salvando..." : "Salvar OS"}
          </Button>
        </div>
      </div>

      <div className="print:hidden">
        <FormBanner message={error} variant="error" />
        <FormBanner message={success} variant="success" />
      </div>

      {/* Cliente */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-slate-900">Cliente</p>
        {customer ? (
          <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-slate-900">{customer.name}</p>
              <p className="text-xs text-slate-500">
                {customer.phone ?? "sem telefone"}
                {customer.document ? ` · ${customer.document}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCustomer(null)}
              className="text-xs text-red-600 hover:underline print:hidden"
            >
              Trocar
            </button>
          </div>
        ) : (
          <div className="print:hidden">
            <div className="flex gap-2">
              <Input
                value={customerTerm}
                onChange={(e) => searchCustomers(e.target.value)}
                placeholder="Buscar cliente por nome, documento ou telefone..."
                className="min-w-0 flex-1"
              />
              <Link
                href="/clientes/novo"
                target="_blank"
                className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cadastrar cliente
              </Link>
            </div>
            {searchingCustomer && <p className="mt-2 text-xs text-slate-400">Buscando...</p>}
            {customerResults.length > 0 && (
              <div className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200">
                {customerResults.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setCustomer(option);
                      setCustomerTerm("");
                      setCustomerResults([]);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-900">{option.name}</span>
                    <span className="ml-2 text-xs text-slate-400">
                      {option.document ?? option.phone ?? ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Coluna principal */}
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-slate-900">Informações do Aparelho</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="brand">Marca *</Label>
                <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="model">Modelo *</Label>
                <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="color">Cor</Label>
                <Input id="color" value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="imei">IMEI / Nº de série</Label>
                <Input id="imei" value={imei} onChange={(e) => setImei(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="passcode">Senha / padrão informado</Label>
                <Input
                  id="passcode"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>
            <div className="mt-4">
              <Label>Aparelho liga?</Label>
              <div className="flex gap-4 text-sm text-slate-700">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={turnsOn} onChange={() => setTurnsOn(true)} /> Sim
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={!turnsOn} onChange={() => setTurnsOn(false)} /> Não
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <Label htmlFor="reportedDefects">Defeitos Informados</Label>
            <Textarea
              id="reportedDefects"
              rows={4}
              value={reportedDefects}
              onChange={(e) => setReportedDefects(e.target.value)}
              placeholder="Descreva os defeitos informados pelo cliente"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <Label htmlFor="condition">Estado do Aparelho</Label>
            <Textarea
              id="condition"
              rows={4}
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              placeholder="Descrição geral do aparelho (avarias visuais, etc.)"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
            <p className="mb-3 text-sm font-semibold text-slate-900">Fotos do Aparelho (opcional)</p>
            <MultiImageUploadField value={photoUrls} onChange={setPhotoUrls} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <Label htmlFor="internalNotes">Observações Internas</Label>
            <Textarea
              id="internalNotes"
              rows={3}
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Informações internas sobre o atendimento"
            />
          </div>

          {isEditing && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
              <p className="mb-3 text-sm font-semibold text-slate-900">Histórico</p>
              {meta!.events.length === 0 ? (
                <p className="text-sm text-slate-400">Sem eventos registrados.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {meta!.events.map((event) => (
                    <li key={event.id} className="flex justify-between gap-3 text-slate-700">
                      <span>{event.message}</span>
                      <span className="shrink-0 text-xs text-slate-400">{event.createdAt}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Coluna lateral: serviços, status, datas, ações */}
        <div className="min-w-0 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Serviço(s) a Realizar</p>
              <button
                type="button"
                onClick={addServiceLine}
                className="text-xs font-medium text-slate-700 hover:underline print:hidden"
              >
                + Adicionar serviço
              </button>
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhum serviço adicionado.</p>
            ) : (
              <div className="space-y-3">
                {items.map((line) => (
                  <div key={line.key} className="rounded-md border border-slate-200 p-2">
                    <Input
                      value={line.description}
                      onChange={(e) => updateServiceLine(line.key, { description: e.target.value })}
                      placeholder="Descrição do serviço"
                      className="mb-2"
                    />
                    <div className="grid grid-cols-2 gap-2 print:hidden">
                      <div>
                        <label className="text-xs text-slate-400">Valor unit. (R$)</label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.unitPrice || ""}
                          onChange={(e) =>
                            updateServiceLine(line.key, { unitPrice: Number(e.target.value) || 0 })
                          }
                          placeholder="0,00"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400">Qtd.</label>
                        <Input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) =>
                            updateServiceLine(line.key, {
                              quantity: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900">
                        Subtotal: {formatBRL(line.unitPrice * line.quantity)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeServiceLine(line.key)}
                        className="text-xs text-red-600 hover:underline print:hidden"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Total dos serviços</span>
                <span>{formatBRL(servicesTotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 print:hidden">
                <span className="text-slate-600">Desconto (R$)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={discount || ""}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                  className="h-8 w-28 rounded border border-slate-300 px-2 text-right text-sm"
                />
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
                <span>Total com desconto</span>
                <span style={{ color: "#047857" }}>{formatBRL(totalWithDiscount)}</span>
              </div>
            </div>
          </div>

          {isEditing && meta && (
            <>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="mb-2 text-sm font-semibold text-slate-900">Situação da OS</p>
                <Select
                  value={status}
                  disabled={isUpdatingStatus}
                  onChange={(e) => handleStatusChange(e.target.value as RepairOrderStatusValue)}
                  className="print:hidden"
                >
                  {REPAIR_ORDER_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {REPAIR_ORDER_STATUS_LABELS[value]}
                    </option>
                  ))}
                </Select>
                <span
                  className={clsx(
                    "mt-2 inline-block rounded px-2 py-0.5 text-xs font-medium",
                    REPAIR_ORDER_STATUS_BADGE_CLASSES[status]
                  )}
                >
                  {REPAIR_ORDER_STATUS_LABELS[status]}
                </span>

                <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-600">
                  <Label htmlFor="estimatedAt">Data prevista de entrega</Label>
                  <input
                    id="estimatedAt"
                    type="date"
                    value={estimatedAt}
                    onChange={(e) => setEstimatedAt(e.target.value)}
                    className="h-9 w-full rounded border border-slate-300 px-2 text-sm print:hidden"
                  />
                  <div className="flex justify-between pt-2">
                    <span>Entrada</span>
                    <span>{meta.createdAt}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Última atualização</span>
                    <span>{meta.updatedAt}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Retirada</span>
                    <span>{meta.pickedUpAt ?? "—"}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 print:hidden">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Imprimir OS
                </button>
                <button
                  type="button"
                  onClick={handleWhatsapp}
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                >
                  Enviar por WhatsApp
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
