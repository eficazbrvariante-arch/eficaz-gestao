import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { parseBusinessHours, type BusinessHourEntry } from "@/modules/catalog/tenant-resolver";
import { StoreSettingsForm } from "./store-settings-form";
import type { StoreSettingsInput } from "@/lib/validations/store-settings";

function defaultBusinessHours(): BusinessHourEntry[] {
  return Array.from({ length: 7 }, (_, day) => ({
    day,
    opensAt: "09:00",
    closesAt: "18:00",
    closed: true,
  }));
}

export default async function ConfiguracoesLojaPage() {
  const user = await requireUser();

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: user.tenantId },
    select: {
      businessHours: true,
      aboutText: true,
      exchangePolicy: true,
      warrantyPolicy: true,
      privacyPolicy: true,
      acceptedPaymentMethods: true,
      maxInstallments: true,
      minInstallmentValue: true,
    },
  });

  const storedHours = parseBusinessHours(tenant.businessHours);
  const businessHours =
    storedHours.length === 7
      ? storedHours.sort((a, b) => a.day - b.day)
      : defaultBusinessHours();

  const defaultValues: StoreSettingsInput = {
    businessHours,
    aboutText: tenant.aboutText ?? "",
    exchangePolicy: tenant.exchangePolicy ?? "",
    warrantyPolicy: tenant.warrantyPolicy ?? "",
    privacyPolicy: tenant.privacyPolicy ?? "",
    acceptedPaymentMethods: tenant.acceptedPaymentMethods,
    installmentsEnabled: tenant.maxInstallments !== null,
    maxInstallments: tenant.maxInstallments ?? undefined,
    minInstallmentValue: tenant.minInstallmentValue ? Number(tenant.minInstallmentValue) : undefined,
  };

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Loja: horário e políticas</h1>
      <p className="mb-6 text-sm text-slate-500">
        Horário de atendimento, políticas institucionais, formas de pagamento e parcelamento
        exibidos no catálogo online — tudo com base no que a loja realmente pratica.
      </p>

      <div className="max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <StoreSettingsForm defaultValues={defaultValues} />
      </div>
    </div>
  );
}
