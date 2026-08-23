import { redirect } from "next/navigation";
import { getCurrentUser, requireTenant } from "@/lib/session";
import { canManageSettings } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { DeviceRowActions } from "./device-row-actions";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  REJECTED: "Recusado",
};

const STATUS_CLASSES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
};

export default async function DispositivosPage() {
  const { user, tenant } = await requireTenant();
  if (!canManageSettings(user.role)) redirect("/dashboard");

  const [devices, sessionUser] = await Promise.all([
    prisma.device.findMany({
      where: { tenantId: tenant.id },
      include: {
        requestedBy: { select: { name: true } },
        statusChangedBy: { select: { name: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    getCurrentUser(),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Dispositivos</h1>
        <p className="text-sm text-text-muted">
          Só computadores/navegadores aprovados aqui conseguem fazer login no PDV,
          mesmo com senha certa.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Dispositivo</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Solicitado por</th>
              <th className="px-4 py-3 font-medium">Alterado por</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.id} className="border-b border-slate-100 last:border-0 align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">...{device.id.slice(-8)}</div>
                  <div className="text-xs text-slate-400">{device.ipAddress ?? "IP desconhecido"}</div>
                  <div className="max-w-xs truncate text-xs text-slate-400" title={device.userAgent ?? ""}>
                    {device.userAgent ?? "Navegador desconhecido"}
                  </div>
                  <div className="text-xs text-slate-400">
                    Detectado em {formatDateTime(device.createdAt)}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASSES[device.status]}`}
                  >
                    {STATUS_LABELS[device.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{device.requestedBy?.name ?? "-"}</td>
                <td className="px-4 py-3 text-slate-500">
                  {device.statusChangedBy?.name ?? "-"}
                  {device.statusChangedAt && (
                    <div className="text-xs text-slate-400">
                      {formatDateTime(device.statusChangedAt)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <DeviceRowActions
                    deviceId={device.id}
                    status={device.status}
                    isCurrentDevice={device.id === sessionUser?.deviceId}
                  />
                </td>
              </tr>
            ))}
            {devices.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Nenhum dispositivo registrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
