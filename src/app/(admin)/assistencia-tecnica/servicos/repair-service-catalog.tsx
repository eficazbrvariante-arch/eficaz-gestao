"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { FormBanner } from "@/components/ui/form-banner";
import { formatBRL } from "@/lib/format";
import type { RepairServiceOption } from "@/modules/repairs/repair-service-catalog";
import { setRepairServiceActiveAction } from "./actions";
import { RepairServiceFormDialog } from "./repair-service-form-dialog";

/** Sem acento e minúsculo — "Troca de tela" acha digitando "troca tela" ou "câmera"/"camera". */
function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function matchesServiceTerm(name: string, term: string) {
  const words = normalize(term).split(/\s+/).filter(Boolean);
  const target = normalize(name);
  return words.every((word) => target.includes(word));
}

export function RepairServiceCatalog({
  initialServices,
  isAdmin,
}: {
  initialServices: RepairServiceOption[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [services, setServices] = useState(initialServices);
  const [term, setTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RepairServiceOption | null>(null);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [isToggling, startToggle] = useTransition();

  const filtered = useMemo(
    () => (term.trim() ? services.filter((s) => matchesServiceTerm(s.name, term)) : services),
    [services, term]
  );

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function handleSaved(saved: RepairServiceOption) {
    setSuccess(editing ? "Serviço salvo." : `Serviço "${saved.name}" registrado.`);
    setError(undefined);
    setServices((current) => {
      const exists = current.some((s) => s.id === saved.id);
      const next = exists ? current.map((s) => (s.id === saved.id ? saved : s)) : [...current, saved];
      return next.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"));
    });
    setTerm("");
    router.refresh();
  }

  function toggleActive(service: RepairServiceOption) {
    setError(undefined);
    setSuccess(undefined);
    startToggle(async () => {
      const result = await setRepairServiceActiveAction(service.id, !service.active);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSuccess(result.success);
      setServices((current) =>
        current.map((s) => (s.id === service.id ? { ...s, active: !service.active } : s))
      );
    });
  }

  return (
    <div className="space-y-4">
      <FormBanner message={error} variant="error" />
      <FormBanner message={success} variant="success" />

      <div className="flex flex-wrap gap-2">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Buscar serviço (ex.: tela, bateria, conector)..."
          className="min-w-0 flex-1 text-base sm:max-w-md"
          autoFocus
        />
        <button
          type="button"
          onClick={openCreate}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Novo serviço
        </button>
      </div>

      {term.trim() && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
          Nenhum serviço encontrado para “{term.trim()}”.{" "}
          <button
            type="button"
            onClick={openCreate}
            className="font-medium text-slate-900 underline"
          >
            Registrar “{term.trim()}”
          </button>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Serviço</th>
                <th className="px-4 py-3 text-right font-medium">Preço final</th>
                {isAdmin && (
                  <>
                    <th className="px-4 py-3 text-right font-medium">Custo</th>
                    <th className="px-4 py-3 text-right font-medium">Lucro</th>
                    <th className="px-4 py-3 font-medium">Fornecedor</th>
                    <th className="px-4 py-3" />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((service) => (
                <tr
                  key={service.id}
                  className={`border-b border-slate-100 last:border-0 ${service.active ? "" : "opacity-60"}`}
                >
                  <td className="px-4 py-3 text-slate-900">
                    {service.name}
                    {!service.active && (
                      <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        Desativado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                    {formatBRL(service.price)}
                  </td>
                  {isAdmin && (
                    <>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {service.costPrice === null ? "—" : formatBRL(service.costPrice)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {service.costPrice === null ? "—" : formatBRL(service.price - service.costPrice)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{service.supplier?.name ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(service);
                            setDialogOpen(true);
                          }}
                          className="text-sm text-slate-600 hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(service)}
                          disabled={isToggling}
                          className="ml-3 text-sm text-slate-600 hover:underline disabled:opacity-50"
                        >
                          {service.active ? "Desativar" : "Reativar"}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!term.trim() && services.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
          Nenhum serviço cadastrado ainda. Busque pelo nome e registre, ou use “Novo serviço”.
        </p>
      )}

      <RepairServiceFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        initialName={editing ? undefined : term.trim()}
        service={editing}
        canSetCost={isAdmin}
        onSaved={handleSaved}
      />
    </div>
  );
}
