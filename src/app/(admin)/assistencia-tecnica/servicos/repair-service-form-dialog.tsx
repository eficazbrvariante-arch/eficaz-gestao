"use client";

import { useEffect, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FormBanner } from "@/components/ui/form-banner";
import type { RepairServiceOption } from "@/modules/repairs/repair-service-catalog";
import {
  createRepairServiceAction,
  listRepairServiceSuppliersAction,
  updateRepairServiceAction,
} from "./actions";

/**
 * Cadastro rápido (e edição, para o Admin) de um serviço do catálogo da
 * assistência. Aberto a partir da busca quando nada é encontrado — o nome já
 * vem com o que foi digitado. Custo e fornecedor são opcionais e só aparecem
 * para quem pode vê-los (`canSetCost`); o servidor confere de novo.
 */
export function RepairServiceFormDialog({
  open,
  onClose,
  initialName = "",
  service,
  canSetCost,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initialName?: string;
  /** Presente só ao editar um serviço existente (Admin). */
  service?: RepairServiceOption | null;
  canSetCost: boolean;
  onSaved: (service: RepairServiceOption) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={service ? "Editar serviço" : "Registrar serviço"}>
      {/* Só monta aberto: cada abertura começa com os campos certos, sem
          sobra do cadastro anterior. */}
      {open && (
        <RepairServiceForm
          initialName={initialName}
          service={service ?? null}
          canSetCost={canSetCost}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Dialog>
  );
}

function RepairServiceForm({
  initialName,
  service,
  canSetCost,
  onClose,
  onSaved,
}: {
  initialName: string;
  service: RepairServiceOption | null;
  canSetCost: boolean;
  onClose: () => void;
  onSaved: (service: RepairServiceOption) => void;
}) {
  const [name, setName] = useState(service?.name ?? initialName);
  const [price, setPrice] = useState(service ? String(service.price) : "");
  const [costPrice, setCostPrice] = useState(
    service?.costPrice !== null && service?.costPrice !== undefined ? String(service.costPrice) : ""
  );
  const [supplierId, setSupplierId] = useState(service?.supplier?.id ?? "");
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (canSetCost) listRepairServiceSuppliersAction().then(setSuppliers);
  }, [canSetCost]);

  function handleSubmit() {
    setError(undefined);
    const priceValue = Number(price.replace(",", "."));
    if (!name.trim()) {
      setError("Informe o nome do serviço.");
      return;
    }
    if (!(priceValue > 0)) {
      setError("Informe o preço final do serviço.");
      return;
    }
    const costValue = costPrice.trim() === "" ? null : Number(costPrice.replace(",", "."));
    if (costValue !== null && !(costValue >= 0)) {
      setError("Valor de custo inválido.");
      return;
    }

    const input = {
      name: name.trim(),
      price: priceValue,
      costPrice: canSetCost ? costValue : null,
      supplierId: canSetCost ? supplierId : "",
    };

    startTransition(async () => {
      if (service) {
        const result = await updateRepairServiceAction(service.id, input);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        const supplier = suppliers.find((s) => s.id === input.supplierId) ?? null;
        onSaved({ ...service, name: input.name, price: input.price, costPrice: input.costPrice, supplier });
      } else {
        const result = await createRepairServiceAction(input);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        onSaved(result.service);
      }
      onClose();
    });
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <FormBanner message={error} variant="error" />
      <div>
        <Label htmlFor="repair-service-name">Serviço</Label>
        <Input
          id="repair-service-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Troca de tela iPhone 11"
        />
      </div>
      <div>
        <Label htmlFor="repair-service-price">Preço final / valor do serviço (R$)</Label>
        <Input
          id="repair-service-price"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0,00"
          autoFocus
        />
      </div>
      {canSetCost && (
        <>
          <div>
            <Label htmlFor="repair-service-cost">Valor de custo (R$) — opcional</Label>
            <Input
              id="repair-service-cost"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div>
            <Label htmlFor="repair-service-supplier">Fornecedor — opcional</Label>
            <Select
              id="repair-service-supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Sem fornecedor</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        </>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" fullWidth={false} onClick={onClose} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" fullWidth={false} disabled={isPending}>
          {isPending ? "Salvando..." : service ? "Salvar" : "Registrar"}
        </Button>
      </div>
    </form>
  );
}
