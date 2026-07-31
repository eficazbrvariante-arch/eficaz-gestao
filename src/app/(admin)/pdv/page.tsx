import Link from "next/link";
import { requireUser } from "@/lib/session";
import { canApplyDiscount, canSell } from "@/lib/permissions";
import { getOpenCashRegister, getCashSummary } from "@/modules/cash/cash-service";
import { formatBRL, formatDateTime } from "@/lib/format";
import { PdvScreen } from "./pdv-screen";

export default async function PdvPage() {
  const user = await requireUser();

  if (!canSell(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para realizar vendas no PDV.
      </div>
    );
  }

  const register = await getOpenCashRegister(user.tenantId);

  if (!register) {
    return (
      <div>
        <h1 className="mb-1 text-xl font-semibold text-slate-900">PDV</h1>
        <p className="mb-6 text-sm text-slate-500">
          É necessário abrir o caixa antes de registrar vendas.
        </p>
        <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6">
          <p className="mb-4 text-sm text-amber-900">
            Nenhum caixa aberto no momento. Abra o caixa informando o valor inicial da gaveta.
          </p>
          <Link
            href="/caixa"
            className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Abrir caixa
          </Link>
        </div>
      </div>
    );
  }

  const summary = await getCashSummary(user.tenantId, register.id);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">PDV</h1>
          <p className="text-sm text-slate-500">
            Caixa aberto por {register.openedBy.name} em {formatDateTime(register.openedAt)}
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-right">
            <p className="text-slate-500">Vendas neste caixa</p>
            <p className="font-semibold text-slate-900">
              {summary.salesCount} · {formatBRL(summary.cashSales + summary.otherSales)}
            </p>
          </div>
          <Link
            href="/caixa"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
          >
            Caixa
          </Link>
        </div>
      </div>

      <PdvScreen canDiscount={canApplyDiscount(user.role)} />
    </div>
  );
}
