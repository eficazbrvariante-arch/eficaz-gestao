import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatBRL } from "@/lib/format";
import { DeliverySettingsForm, DeliveryZoneForm } from "./delivery-forms";
import { deleteDeliveryZoneAction } from "./actions";

export default async function ConfiguracoesEntregaPage() {
  const user = await requireUser();

  const [tenant, zones] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: {
        deliveryEnabled: true,
        pickupEnabled: true,
        stockPolicy: true,
        pickupNotes: true,
      },
    }),
    prisma.deliveryZone.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { fee: "asc" },
    }),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Entrega e retirada</h1>
      <p className="mb-6 text-sm text-slate-500">
        Define como o cliente recebe o pedido feito no catálogo online e quanto custa a entrega
        em cada região.
      </p>

      <div className="mb-6 max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Opções de recebimento</h2>
        <DeliverySettingsForm
          defaultValues={{
            deliveryEnabled: tenant.deliveryEnabled,
            pickupEnabled: tenant.pickupEnabled,
            stockPolicy: tenant.stockPolicy,
            pickupNotes: tenant.pickupNotes ?? "",
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Nova faixa de entrega</h2>
          <DeliveryZoneForm />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
            Faixas cadastradas
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Faixa</th>
                  <th className="px-4 py-3 font-medium">Bairro / CEP</th>
                  <th className="px-4 py-3 font-medium">Taxa</th>
                  <th className="px-4 py-3 font-medium">Prazo</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => (
                  <tr key={zone.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{zone.name}</div>
                      {!zone.active && (
                        <span className="text-xs text-slate-400">inativa</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {zone.neighborhood ?? "-"}
                      {zone.zipStart && zone.zipEnd && (
                        <div className="text-xs text-slate-400">
                          CEP {zone.zipStart} a {zone.zipEnd}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-900">{formatBRL(zone.fee)}</td>
                    <td className="px-4 py-3 text-slate-500">{zone.estimate ?? "-"}</td>
                    <td className="px-4 py-3 text-right">
                      <form action={deleteDeliveryZoneAction.bind(null, zone.id)}>
                        <button type="submit" className="text-sm text-red-600 hover:underline">
                          Excluir
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {zones.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                      Nenhuma faixa cadastrada. Sem faixas, os pedidos com entrega ficam com
                      taxa zero e a loja combina o valor com o cliente.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
