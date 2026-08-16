import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canEditCommission, canManageEmployeeLedger } from "@/lib/permissions";
import { formatISODate } from "@/lib/format";
import { computeHourlyPaymentPreview } from "@/modules/employees/hourly-payment-service";
import { resolvePeriod } from "../../../relatorios/period";
import { PeriodPicker } from "../../../relatorios/report-nav";
import { HorasPanel } from "./horas-panel";

export default async function HorasColaboradorPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const { userId } = await params;
  const user = await requireUser();
  if (!canManageEmployeeLedger(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar esta página.
      </div>
    );
  }

  const employee = await prisma.user.findFirst({
    where: { id: userId, tenantId: user.tenantId },
    select: { id: true, name: true, hourlyRate: true },
  });
  if (!employee) notFound();

  const period = resolvePeriod(await searchParams);
  const preview = await computeHourlyPaymentPreview(user.tenantId, userId, period);

  return (
    <div>
      <div className="mb-6">
        <Link href="/colaboradores" className="text-sm text-slate-500 hover:underline">
          ← Voltar para Colaboradores
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">
          Pagamento por horas — {employee.name}
        </h1>
        <p className="text-sm text-slate-500">
          {formatISODate(period.from)} a {formatISODate(period.to)} · horas somadas a partir do
          que já está registrado no Ponto.
        </p>
      </div>

      <div className="mb-6">
        <PeriodPicker period={period} />
      </div>

      <HorasPanel
        userId={employee.id}
        hourlyRate={Number(employee.hourlyRate)}
        canEditRate={canEditCommission(user.role)}
        days={preview.days}
        totalMinutes={preview.totalMinutes}
        amount={preview.amount}
        from={period.from}
        to={period.to}
      />
    </div>
  );
}
