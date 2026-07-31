import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStoreBySubdomain } from "@/modules/catalog/tenant-resolver";
import { CheckoutForm } from "./checkout-form";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const store = await getStoreBySubdomain(subdomain);
  if (!store) notFound();

  const settings = await prisma.tenant.findUniqueOrThrow({
    where: { id: store.id },
    select: { deliveryEnabled: true, pickupEnabled: true, pickupNotes: true },
  });

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Finalizar pedido</h1>
      <p className="mb-6 text-sm text-slate-500">
        Preencha seus dados. Depois de enviar, você poderá mandar o pedido para o WhatsApp da
        loja.
      </p>

      <CheckoutForm
        subdomain={store.subdomain}
        base={`/loja/${store.subdomain}`}
        deliveryEnabled={settings.deliveryEnabled}
        pickupEnabled={settings.pickupEnabled}
        pickupNotes={settings.pickupNotes}
      />
    </div>
  );
}
