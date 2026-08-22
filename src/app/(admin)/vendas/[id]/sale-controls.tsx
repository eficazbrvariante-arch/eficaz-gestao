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
import { cancelSaleAction, editSaleAction, reportSaleItemDefectAction } from "../actions";
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

export type EditableSaleItem = {
  id: string;
  nameSnapshot: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};

/** Tolerância pra comparar o total corrigido com o original (ruído de ponto flutuante). */
const CENT = 0.005;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

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
  canEdit,
  canViewAllSales,
  isCancelled,
  openCancelForm = false,
  items,
  editableItems,
}: {
  saleId: string;
  saleTotal: number;
  /** Cliente já vinculado à venda, se houver — recebe o crédito automaticamente. */
  existingCustomer: { id: string; name: string } | null;
  canCancel: boolean;
  /** Só ADMIN, venda não cancelada e caixa ainda aberto — ver `canEditSale`. */
  canEdit: boolean;
  canViewAllSales: boolean;
  isCancelled: boolean;
  /** Abre o formulário de cancelamento já expandido (link direto da lista de vendas). */
  openCancelForm?: boolean;
  /** Itens da venda elegíveis para troca por defeito — só quem ainda tem quantidade sobrando aparece. */
  items: SaleItemDefectOption[];
  /** Itens da venda pra corrigir preço/desconto — sem produto/quantidade, isso não muda. */
  editableItems: EditableSaleItem[];
}) {
  const [showCancel, setShowCancel] = useState(openCancelForm && canCancel && !isCancelled);
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const [showEdit, setShowEdit] = useState(false);
  const [editValues, setEditValues] = useState<{ unitPrice: string; discount: string }[]>(() =>
    editableItems.map((item) => ({ unitPrice: String(item.unitPrice), discount: String(item.discount) }))
  );
  const [editError, setEditError] = useState<string>();
  const [isEditing, startEditTransition] = useTransition();

  const editedTotal = round2(
    editableItems.reduce((sum, item, index) => {
      const unitPrice = Number(editValues[index]?.unitPrice) || 0;
      const discount = Number(editValues[index]?.discount) || 0;
      return sum + round2(unitPrice * item.quantity - discount);
    }, 0)
  );
  const editedTotalMatches = Math.abs(editedTotal - saleTotal) <= CENT;

  function openEdit() {
    setEditValues(
      editableItems.map((item) => ({ unitPrice: String(item.unitPrice), discount: String(item.discount) }))
    );
    setEditError(undefined);
    setShowEdit(true);
  }

  function submitEdit() {
    setEditError(undefined);
    if (!editedTotalMatches) {
      setEditError("O total corrigido precisa ficar igual ao total original da venda.");
      return;
    }
    startEditTransition(async () => {
      const result = await editSaleAction(saleId, {
        edits: editableItems.map((item, index) => ({
          itemId: item.id,
          unitPrice: Number(editValues[index]?.unitPrice) || 0,
          discount: Number(editValues[index]?.discount) || 0,
        })),
      });
      if (result?.error) {
        setEditError(result.error);
        return;
      }
      setShowEdit(false);
    });
  }

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
        {canEdit && (
          <button
            type="button"
            onClick={() => (showEdit ? setShowEdit(false) : openEdit())}
            className="rounded-md border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
          >
            Editar venda
          </button>
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

      {showEdit && (
        <div className="mt-4 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-3 text-sm text-amber-900">
            Corrija preço unitário e/ou desconto dos itens já vendidos — o produto e a quantidade
            não mudam. O total precisa continuar {formatBRL(saleTotal)}; a correção fica registrada
            no histórico com seu nome.
          </p>
          <FormBanner message={editError} variant="error" />

          <div className="mb-3 space-y-3">
            {editableItems.map((item, index) => (
              <div key={item.id} className="rounded-md border border-amber-200 bg-white p-3">
                <p className="mb-2 text-sm font-medium text-slate-900">
                  {item.nameSnapshot} <span className="text-xs text-slate-400">× {item.quantity}</span>
                </p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Label htmlFor={`edit-price-${item.id}`}>Preço unitário</Label>
                    <Input
                      id={`edit-price-${item.id}`}
                      type="number"
                      step="0.01"
                      min={0}
                      value={editValues[index]?.unitPrice ?? ""}
                      onChange={(e) =>
                        setEditValues((prev) =>
                          prev.map((v, i) => (i === index ? { ...v, unitPrice: e.target.value } : v))
                        )
                      }
                    />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor={`edit-discount-${item.id}`}>Desconto</Label>
                    <Input
                      id={`edit-discount-${item.id}`}
                      type="number"
                      step="0.01"
                      min={0}
                      value={editValues[index]?.discount ?? ""}
                      onChange={(e) =>
                        setEditValues((prev) =>
                          prev.map((v, i) => (i === index ? { ...v, discount: e.target.value } : v))
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div
            className={
              editedTotalMatches
                ? "mb-3 flex justify-between rounded-md bg-white px-3 py-2 text-sm font-medium text-emerald-700"
                : "mb-3 flex justify-between rounded-md bg-white px-3 py-2 text-sm font-medium text-red-700"
            }
          >
            <span>Total corrigido</span>
            <span>
              {formatBRL(editedTotal)} {editedTotalMatches ? "" : `(original: ${formatBRL(saleTotal)})`}
            </span>
          </div>

          <Button
            type="button"
            disabled={isEditing || !editedTotalMatches}
            fullWidth={false}
            onClick={submitEdit}
            className="bg-amber-600 px-4 hover:bg-amber-700"
          >
            {isEditing ? "Salvando..." : "Salvar correção"}
          </Button>
        </div>
      )}

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
