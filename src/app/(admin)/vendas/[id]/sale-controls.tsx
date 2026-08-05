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
import { cancelSaleAction } from "../actions";
import { searchCustomersAction } from "../../clientes/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";

type CustomerOption = { id: string; name: string; document: string | null; phone: string | null };

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
}) {
  const [showCancel, setShowCancel] = useState(openCancelForm && canCancel && !isCancelled);
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const [creditCustomer, setCreditCustomer] = useState<CustomerOption | null>(null);
  const [customerTerm, setCustomerTerm] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [isSearchingCustomer, startCustomerSearch] = useTransition();

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
    </div>
  );
}
