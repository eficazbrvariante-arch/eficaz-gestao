import { requireUser } from "@/lib/session";
import {
  canEnterRepairOrderCostOnCreate,
  canGrantRepairOrderCourtesy,
  canManageFiado,
  canManageRepairOrderCostAnytime,
  canManageRepairOrders,
} from "@/lib/permissions";
import { RepairOrderWorkspace, type RepairOrderDefaults } from "../repair-order-workspace";

const EMPTY_DEFAULTS: RepairOrderDefaults = {
  customer: null,
  seller: null,
  brand: "",
  model: "",
  color: "",
  imei: "",
  passcode: "",
  turnsOn: true,
  condition: "",
  reportedDefects: "",
  internalNotes: "",
  estimatedAt: "",
  discount: 0,
  costPrice: null,
  items: [],
  photoUrls: [],
};

export default async function NovaOrdemServicoPage() {
  const user = await requireUser();
  if (!canManageRepairOrders(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar a assistência técnica.
      </div>
    );
  }

  return (
    <RepairOrderWorkspace
      defaults={EMPTY_DEFAULTS}
      canEditCost={canEnterRepairOrderCostOnCreate(user.role)}
      canViewProfit={canManageRepairOrderCostAnytime(user.role)}
      financials={null}
      canFiado={canManageFiado(user.role)}
      canGrantCourtesy={canGrantRepairOrderCourtesy(user.role)}
    />
  );
}
