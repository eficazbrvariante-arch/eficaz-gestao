"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatBRL } from "@/lib/format";
import {
  cancelSaleSchema,
  type CancelSaleInput,
  type CancelSaleFormValues,
} from "@/lib/validations/sale";
import { cancelSaleAction, reportSaleItemDefectAction } from "../actions";
import { searchCustomersAction } from "../../clientes/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";
import { MultiImageUploadField } from "@/components/ui/multi-image-upload-field";

type CustomerOption = { id: string; name: string; document: string | null; phone: string | null };

export type SaleItemDefectOption = {
  id: string;
  nameSnapshot: string;
  /** Quantidade ainda trocável — quantidade do item menos o que já foi reportado antes. */
  remaining: number;
};

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      Imprimir comprovante
    </button>
  );
}

export function SaleActions({
  saleId,
  saleTotal,
  existingCustomer,
  canCancel,
  canViewAllSales,
  isCancelled,
  openCancelForm = false,
  items,
}: {
  saleId: string;
  saleTotal: number;
  /** Cliente já vinculado à venda, se houver — recebe o crédito automaticamente. */
  existingCustomer: { id: string; name: string } | null;
  canCancel: boolean;
  canViewAllSales: boolean;
  isCancelled: boolean;
  /** Abre o formulário de cancelamento já expandido (link direto da lista de vendas). */
  openCancelForm?: boolean;
  /** Itens da venda elegíveis para troca por defeito — só quem ainda tem quantidade sobrando aparece. */
  items: SaleItemDefectOption[];
}) {
  const [showCancel, setShowCancel] = useState(openCancelForm && canCancel && !isCancelled);
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const [creditCustomer, setCreditCustomer] = useState<CustomerOption | null>(null);
  const [customerTerm, setCustomerTerm] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [isSearchingCustomer, startCustomerSearch] = useTransition();

  const reportableItems = items.filter((item) => item.remaining > 0);
  const [showDefect, setShowDefect] = useState(false);
  const [defectItemId, setDefectItemId] = useState(reportableItems[0]?.id ?? "");
  const [defectQuantity, setDefectQuantity] = useState(1);
  const [defectReason, setDefectReason] = useState("");
  const [defectPhotoUrls, setDefectPhotoUrls] = useState<string[]>([]);
  const [defectCustomer, setDefectCustomer] = useState<CustomerOption | null>(null);
  const [defectCustomerTerm, setDefectCustomerTerm] = useState("");
  const [defectCustomerResults, setDefectCustomerResults] = useState<CustomerOption[]>([]);
  const [isSearchingDefectCustomer, startDefectCustomerSearch] = useTransition();
  const [defectError, setDefectError] = useState<string>();
  const [isReportingDefect, startDefectTransition] = useTransition();

  const selectedDefectItem = reportableItems.find((item) => item.id === defectItemId);

  function searchDefectCustomers() {
    const query = defectCustomerTerm.trim();
    if (query.length < 2) return;
    startDefectCustomerSearch(async () => {
      setDefectCustomerResults(await searchCustomersAction(query));
    });
  }

  function submitDefect() {
    setDefectError(undefined);
    if (!selectedDefectItem) {
      setDefectError("Selecione o item com defeito.");
      return;
    }
    if (!existingCustomer && !defectCustomer) {
      setDefectError("Selecione o cliente que vai receber o crédito da troca.");
      return;
    }
    if (defectPhotoUrls.length === 0) {
      setDefectError("Adicione ao menos uma foto do produto com defeito.");
      return;
    }
    if (!defectReason.trim()) {
      setDefectError("Descreva o motivo do defeito.");
      return;
    }

    startDefectTransition(async () => {
      const result = await reportSaleItemDefectAction(saleId, {
        saleItemId: selectedDefectItem.id,
        quantity: defectQuantity,
        reason: defectReason,
        photoUrls: defectPhotoUrls,
        customerId: defectCustomer?.id ?? "",
      });
      if (result?.error) {
        setDefectError(result.error);
        return;
      }
      setShowDefect(false);
      setDefectQuantity(1);
      setDefectReason("");
      setDefectPhotoUrls([]);
      setDefectCustomer(null);
    });
  }

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CancelSaleFormValues, unknown, CancelSaleInput>({
    resolver: zodResolver(cancelSaleSchema),
  });

  function searchCustomers() {
    const query = customerTerm.trim();
    if (query.length < 2) return;
    startCustomerSearch(async () => {
      setCustomerResults(await searchCustomersAction(query));
    });
  }

  const onSubmit = (data: CancelSaleInput) => {
    if (!existingCustomer && !creditCustomer) {
      setServerError("Selecione o cliente que vai receber o crédito do cancelamento.");
      return;
    }
    setServerError(undefined);
    startTransition(async () => {
      const result = await cancelSaleAction(saleId, {
        ...data,
        customerId: creditCustomer?.id ?? "",
      });
      if (result?.error) setServerError(result.error);
      else setShowCancel(false);
    });
  };

  return (
    <div className="print:hidden">
      <div className="flex flex-wrap gap-2">
        <PrintButton />
        <Link
          href="/pdv"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Nova venda
        </Link>
        {canViewAllSales ? (
          <Link
            href="/vendas"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Ver todas as vendas
          </Link>
        ) : (
          <Link
            href="/vendas/buscar"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Buscar outra venda
          </Link>
        )}
        {canCancel && !isCancelled && (
          <button
            type="button"
            onClick={() => setShowCancel((v) => !v)}
            className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Cancelar venda
          </button>
        )}
        {canCancel && !isCancelled && reportableItems.length > 0 && (
          <button
            type="button"
            onClick={() => setShowDefect((v) => !v)}
            className="rounded-md border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
          >
            Produto com defeito
          </button>
        )}
      </div>

      {showCancel && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="mt-4 max-w-md rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="mb-3 text-sm text-red-900">
            O cancelamento devolve os itens ao estoque, mantém a venda no histórico como
            cancelada e gera {formatBRL(saleTotal)} de crédito de loja para o cliente. Esta ação
            não pode ser desfeita.
          </p>
          <FormBanner message={serverError} variant="error" />

          <div className="mb-3">
            <Label>Cliente que recebe o crédito</Label>
            {existingCustomer ? (
              <div className="rounded-md bg-white px-3 py-2 text-sm text-slate-700">
                <span className="font-medium text-slate-900">{existingCustomer.name}</span>
                <span className="ml-1 text-xs text-slate-400">(já vinculado à venda)</span>
              </div>
            ) : creditCustomer ? (
              <div className="flex items-center justify-between rounded-md bg-white px-3 py-2">
                <p className="text-sm font-medium text-slate-900">{creditCustomer.name}</p>
                <button
                  type="button"
                  onClick={() => setCreditCustomer(null)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remover
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input
                    autoComplete="off"
                    value={customerTerm}
                    onChange={(e) => setCustomerTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchCustomers();
                      }
                    }}
                    placeholder="Nome, CPF/CNPJ ou telefone"
                    className="min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={searchCustomers}
                    fullWidth={false}
                    className="shrink-0 px-3"
                  >
                    {isSearchingCustomer ? "Buscando..." : "Buscar"}
                  </Button>
                </div>
                {customerResults.length > 0 && (
                  <div className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
                    {customerResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCreditCustomer(c);
                          setCustomerResults([]);
                          setCustomerTerm("");
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="font-medium text-slate-900">{c.name}</span>
                        <span className="ml-2 text-xs text-slate-400">
                          {c.document ?? c.phone ?? ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Cliente não cadastrado?{" "}
                  <Link href="/clientes/novo" target="_blank" className="underline">
                    Cadastre aqui
                  </Link>{" "}
                  e busque de novo.
                </p>
              </>
            )}
          </div>

          <div className="mb-3">
            <Label htmlFor="reason">Motivo do cancelamento</Label>
            <Input id="reason" autoFocus {...register("reason")} />
            <FieldError message={errors.reason?.message} />
          </div>

          <Button
            type="submit"
            disabled={isPending || (!existingCustomer && !creditCustomer)}
            fullWidth={false}
            className="bg-red-700 px-4 hover:bg-red-800"
          >
            {isPending ? "Cancelando..." : "Confirmar cancelamento"}
          </Button>
        </form>
      )}

      {showDefect && (
        <div className="mt-4 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-3 text-sm text-amber-900">
            Troca só deste item — o restante da venda não é afetado. Gera crédito de loja no valor
            do item pro cliente; o produto sai do estoque vendável.
          </p>
          <FormBanner message={defectError} variant="error" />

          <div className="mb-3">
            <Label htmlFor="defect-item">Item com defeito</Label>
            <Select
              id="defect-item"
              value={defectItemId}
              onChange={(e) => {
                setDefectItemId(e.target.value);
                setDefectQuantity(1);
              }}
            >
              {reportableItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nameSnapshot} ({item.remaining} trocável{item.remaining > 1 ? "eis" : ""})
                </option>
              ))}
            </Select>
          </div>

          {selectedDefectItem && selectedDefectItem.remaining > 1 && (
            <div className="mb-3">
              <Label htmlFor="defect-quantity">Quantidade com defeito</Label>
              <input
                id="defect-quantity"
                type="number"
                min={1}
                max={selectedDefectItem.remaining}
                value={defectQuantity}
                onChange={(e) =>
                  setDefectQuantity(
                    Math.min(
                      selectedDefectItem.remaining,
                      Math.max(1, Number(e.target.value) || 1)
                    )
                  )
                }
                className="h-9 w-24 rounded border border-slate-300 px-2 text-sm"
              />
            </div>
          )}

          <div className="mb-3">
            <Label>Cliente que recebe o crédito</Label>
            {existingCustomer ? (
              <div className="rounded-md bg-white px-3 py-2 text-sm text-slate-700">
                <span className="font-medium text-slate-900">{existingCustomer.name}</span>
                <span className="ml-1 text-xs text-slate-400">(já vinculado à venda)</span>
              </div>
            ) : defectCustomer ? (
              <div className="flex items-center justify-between rounded-md bg-white px-3 py-2">
                <p className="text-sm font-medium text-slate-900">{defectCustomer.name}</p>
                <button
                  type="button"
                  onClick={() => setDefectCustomer(null)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remover
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input
                    autoComplete="off"
                    value={defectCustomerTerm}
                    onChange={(e) => setDefectCustomerTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchDefectCustomers();
                      }
                    }}
                    placeholder="Nome, CPF/CNPJ ou telefone"
                    className="min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={searchDefectCustomers}
                    fullWidth={false}
                    className="shrink-0 px-3"
                  >
                    {isSearchingDefectCustomer ? "Buscando..." : "Buscar"}
                  </Button>
                </div>
                {defectCustomerResults.length > 0 && (
                  <div className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
                    {defectCustomerResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setDefectCustomer(c);
                          setDefectCustomerResults([]);
                          setDefectCustomerTerm("");
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="font-medium text-slate-900">{c.name}</span>
                        <span className="ml-2 text-xs text-slate-400">
                          {c.document ?? c.phone ?? ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Cliente não cadastrado?{" "}
                  <Link href="/clientes/novo" target="_blank" className="underline">
                    Cadastre aqui
                  </Link>{" "}
                  e busque de novo.
                </p>
              </>
            )}
          </div>

          <div className="mb-3">
            <Label htmlFor="defect-reason">Motivo do defeito</Label>
            <Textarea
              id="defect-reason"
              rows={3}
              value={defectReason}
              onChange={(e) => setDefectReason(e.target.value)}
              placeholder="Descreva o defeito relatado pelo cliente"
            />
          </div>

          <div className="mb-3">
            <Label>Foto do produto com defeito</Label>
            <MultiImageUploadField value={defectPhotoUrls} onChange={setDefectPhotoUrls} />
          </div>

          <Button
            type="button"
            disabled={isReportingDefect}
            fullWidth={false}
            onClick={submitDefect}
            className="bg-amber-600 px-4 hover:bg-amber-700"
          >
            {isReportingDefect ? "Registrando..." : "Confirmar troca"}
          </Button>
        </div>
      )}
    </div>
  );
}
