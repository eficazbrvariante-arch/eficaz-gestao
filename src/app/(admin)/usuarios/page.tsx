import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageSettings, ROLE_LABELS } from "@/lib/permissions";
import { planLimits } from "@/lib/plans";
import { formatDateTime } from "@/lib/format";
import { CreateUserForm, UserRowActions } from "./user-forms";

export default async function UsuariosPage() {
  const { user, tenant } = await requireTenant();
  if (!canManageSettings(user.role)) redirect("/dashboard");

  const users = await prisma.user.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      lastLoginAt: true,
    },
  });

  const limits = planLimits(tenant.plan);
  const atLimit = limits.maxUsers !== null && users.length >= limits.maxUsers;
  const activeAdmins = users.filter((u) => u.role === "ADMIN" && u.active).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Usuários</h1>
        <p className="text-sm text-text-muted">
          Quem tem acesso ao painel e o que cada um pode fazer.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm shadow-sm">
        <span className="text-slate-500">Plano:</span>
        <span className="font-medium text-slate-900">{limits.label}</span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-500">
          {users.length}
          {limits.maxUsers !== null ? ` de ${limits.maxUsers}` : ""} usuário(s)
        </span>
        <Link
          href="/configuracoes/plano"
          className="ml-auto text-sm text-slate-600 hover:underline"
        >
          Ver planos
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Novo usuário</h2>
          <CreateUserForm atLimit={atLimit} />
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Pessoa</th>
                <th className="px-4 py-3 font-medium">Último acesso</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0 align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {row.name}
                      {row.id === user.id && (
                        <span className="ml-1 text-xs text-slate-400">(você)</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">{row.email ?? "sem e-mail"}</div>
                    <div className="text-xs text-slate-500">{ROLE_LABELS[row.role]}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {row.lastLoginAt ? formatDateTime(row.lastLoginAt) : "nunca acessou"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        row.active
                          ? "rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                          : "rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
                      }
                    >
                      {row.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <UserRowActions
                      userId={row.id}
                      userName={row.name}
                      role={row.role}
                      active={row.active}
                      isSelf={row.id === user.id}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {activeAdmins === 1 && (
        <p className="mt-4 max-w-3xl rounded-md bg-slate-50 px-4 py-3 text-xs text-slate-500">
          Há apenas um administrador ativo. O sistema impede desativá-lo ou rebaixá-lo, para a
          empresa não ficar sem ninguém que possa gerenciar usuários e configurações. Considere
          promover uma segunda pessoa de confiança.
        </p>
      )}

      <div className="mt-6">
        <Link href="/usuarios/atividades" className="text-sm text-text-muted hover:underline">
          Ver registro de atividades →
        </Link>
      </div>
    </div>
  );
}
