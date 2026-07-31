import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageSettings } from "@/lib/permissions";
import { formatBRL } from "@/lib/format";
import { PLAN_LIMITS } from "@/lib/plans";
import { clsx } from "@/lib/clsx";
import type { Plan } from "@/generated/prisma/enums";

const PLAN_ORDER: Plan[] = ["FREE", "PRO", "BUSINESS"];

function UsageBar({
  label,
  used,
  max,
}: {
  label: string;
  used: number;
  max: number | null;
}) {
  const percent = max === null ? 0 : Math.min(100, Math.round((used / max) * 100));
  const nearLimit = max !== null && percent >= 80;

  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className={nearLimit ? "font-medium text-amber-700" : "text-slate-900"}>
          {used}
          {max === null ? " (ilimitado)" : ` de ${max}`}
        </span>
      </div>
      {max !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={clsx(
              "h-full rounded-full",
              percent >= 100 ? "bg-red-500" : nearLimit ? "bg-amber-500" : "bg-slate-900"
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default async function PlanoPage() {
  const { user, tenant } = await requireTenant();
  if (!canManageSettings(user.role)) redirect("/dashboard");

  const [userCount, productCount] = await Promise.all([
    prisma.user.count({ where: { tenantId: tenant.id } }),
    prisma.product.count({ where: { tenantId: tenant.id } }),
  ]);

  const current = PLAN_LIMITS[tenant.plan];

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Plano e uso</h1>
      <p className="mb-6 text-sm text-slate-500">
        Seu plano atual e quanto dele você já está usando.
      </p>

      <div className="mb-6 max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Plano {current.label}
            </h2>
            <p className="text-xs text-slate-500">{current.description}</p>
          </div>
          <span className="text-lg font-semibold text-slate-900">
            {current.monthlyPrice === 0 ? "Grátis" : `${formatBRL(current.monthlyPrice)}/mês`}
          </span>
        </div>

        <div className="space-y-4">
          <UsageBar label="Usuários" used={userCount} max={current.maxUsers} />
          <UsageBar label="Produtos" used={productCount} max={current.maxProducts} />
        </div>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-slate-900">Planos disponíveis</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {PLAN_ORDER.map((plan) => {
          const limits = PLAN_LIMITS[plan];
          const isCurrent = plan === tenant.plan;
          return (
            <div
              key={plan}
              className={clsx(
                "rounded-xl border bg-white p-5 shadow-sm",
                isCurrent ? "border-slate-900" : "border-slate-200"
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">{limits.label}</h3>
                {isCurrent && (
                  <span className="rounded bg-slate-900 px-2 py-0.5 text-xs text-white">
                    atual
                  </span>
                )}
              </div>
              <p className="mb-3 text-2xl font-semibold text-slate-900">
                {limits.monthlyPrice === 0 ? "Grátis" : formatBRL(limits.monthlyPrice)}
                {limits.monthlyPrice > 0 && (
                  <span className="text-sm font-normal text-slate-400">/mês</span>
                )}
              </p>
              <p className="mb-4 text-xs text-slate-500">{limits.description}</p>
              <ul className="space-y-1 text-sm text-slate-600">
                <li>
                  {limits.maxUsers === null ? "Usuários ilimitados" : `${limits.maxUsers} usuários`}
                </li>
                <li>
                  {limits.maxProducts === null
                    ? "Produtos ilimitados"
                    : `${limits.maxProducts} produtos`}
                </li>
                <li>PDV, catálogo e relatórios completos</li>
              </ul>
            </div>
          );
        })}
      </div>

      <p className="mt-6 max-w-3xl rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600">
        A troca de plano ainda é feita manualmente: fale com o suporte para mudar. A cobrança
        automática entra quando o sistema for aberto para outras empresas.
      </p>
    </div>
  );
}
