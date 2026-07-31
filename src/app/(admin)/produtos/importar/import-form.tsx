"use client";

import { useActionState } from "react";
import { importProductsAction } from "../actions";
import { Button } from "@/components/ui/button";

const initialState = { created: 0, updated: 0, errors: [] as string[] };

export function ImportForm() {
  const [state, formAction, isPending] = useActionState(importProductsAction, initialState);

  return (
    <form action={formAction}>
      <div className="mb-4">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
        />
      </div>

      <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
        {isPending ? "Importando..." : "Importar produtos"}
      </Button>

      {(state.created > 0 || state.updated > 0 || state.errors.length > 0) && (
        <div className="mt-6 space-y-2">
          {(state.created > 0 || state.updated > 0) && (
            <p className="text-sm text-emerald-700">
              {state.created} produto(s) criado(s), {state.updated} atualizado(s).
            </p>
          )}
          {state.errors.length > 0 && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              <p className="mb-1 font-medium">Erros encontrados:</p>
              <ul className="list-inside list-disc">
                {state.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
