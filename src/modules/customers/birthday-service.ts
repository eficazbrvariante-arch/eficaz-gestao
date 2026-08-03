import { prisma } from "@/lib/prisma";
import { todayISO, addDaysISO } from "@/lib/format";

export type BirthdayAlert = { id: string; name: string; when: "today" | "tomorrow" };

/**
 * Aniversariantes de hoje ou amanhã (fuso de Brasília), pra avisar no PDV.
 *
 * Compara só mês/dia — `birthDate` é gravado ao meio-dia em -03:00
 * (`parseDateOnly`), então `getUTCMonth`/`getUTCDate` já refletem a data
 * certa sem precisar converter fuso de novo.
 */
export async function getBirthdayAlerts(tenantId: string): Promise<BirthdayAlert[]> {
  const customers = await prisma.customer.findMany({
    where: { tenantId, birthDate: { not: null } },
    select: { id: true, name: true, birthDate: true },
  });

  const [, todayMonth, todayDay] = todayISO().split("-");
  const [, tomorrowMonth, tomorrowDay] = addDaysISO(todayISO(), 1).split("-");

  const alerts: BirthdayAlert[] = [];
  for (const customer of customers) {
    if (!customer.birthDate) continue;
    const month = String(customer.birthDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(customer.birthDate.getUTCDate()).padStart(2, "0");

    if (month === todayMonth && day === todayDay) {
      alerts.push({ id: customer.id, name: customer.name, when: "today" });
    } else if (month === tomorrowMonth && day === tomorrowDay) {
      alerts.push({ id: customer.id, name: customer.name, when: "tomorrow" });
    }
  }
  return alerts;
}
