import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canCorrectAttendance, canViewAttendancePanel } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatISODate, periodRange, todayISO } from "@/lib/format";
import {
  listEffectiveEntries,
  type EffectiveAttendanceEntry,
} from "@/modules/attendance/attendance-service";
import {
  computeBreakBalance,
  computeDailyBalanceMinutes,
  computeWorkedMinutes,
  parseAttendanceSettings,
} from "@/modules/attendance/attendance-rules";
import { resolvePeriod } from "../../../relatorios/period";
import { PeriodPicker } from "../../../relatorios/report-nav";
import { EmployeeAttendanceList } from "./employee-attendance-list";

export default async function EmployeeAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const user = await requireUser();
  if (!canViewAttendancePanel(user.role)) redirect("/ponto");

  const { userId } = await params;
  const [employee, tenant] = await Promise.all([
    prisma.user.findFirst({
      where: { id: userId, tenantId: user.tenantId },
      select: { id: true, name: true },
    }),
    prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { attendanceSettings: true },
    }),
  ]);
  if (!employee) notFound();

  const { dailyMinutes, breakMinutes } = parseAttendanceSettings(tenant.attendanceSettings);

  const period = resolvePeriod(await searchParams);
  const { start, end } = periodRange(period.from, period.to);
  const entries = await listEffectiveEntries(user.tenantId, { userId: employee.id, from: start, to: end });

  const dayGroups = new Map<string, EffectiveAttendanceEntry[]>();
  for (const entry of entries) {
    const key = todayISO(entry.occurredAt);
    const list = dayGroups.get(key) ?? [];
    list.push(entry);
    dayGroups.set(key, list);
  }

  const days = [...dayGroups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, dayEntries]) => {
      const sorted = [...dayEntries].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
      const worked = computeWorkedMinutes(sorted);
      return {
        date,
        entries: sorted,
        worked,
        balanceMinutes: computeDailyBalanceMinutes(worked.workedMinutes, dailyMinutes),
        breakBalance: computeBreakBalance(sorted, breakMinutes),
      };
    });

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">{employee.name}</h1>
      <p className="mb-6 text-sm text-slate-500">
        {formatISODate(period.from)} a {formatISODate(period.to)}
      </p>

      <PeriodPicker period={period} />

      <EmployeeAttendanceList days={days} canCorrect={canCorrectAttendance(user.role)} />
    </div>
  );
}
