import { requireUser } from "@/lib/session";
import { canWaiveAttendanceSelfie } from "@/lib/permissions";
import { listActiveEmployeesAction } from "./actions";
import { ClockWidget } from "./clock-widget";

export default async function PontoPage() {
  const user = await requireUser();
  const employees = await listActiveEmployeesAction();

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Controle de Ponto</h1>
      <p className="mb-6 text-sm text-slate-500">
        Várias pessoas usam este dispositivo — selecione quem está batendo o ponto antes de
        registrar.
      </p>

      <ClockWidget employees={employees} canWaive={canWaiveAttendanceSelfie(user.role)} />
    </div>
  );
}
