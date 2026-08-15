import { prisma } from "@/lib/prisma";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type ConvenioVitrineProduct = {
  productId: string;
  name: string;
  catalogPrice: number;
  discountAmount: number;
  finalPrice: number;
};

export type CustomerConvenioBenefit = {
  convenioName: string;
  /** `false` quando o colaborador foi suspenso/bloqueado ou o convênio foi desativado — mostra o card, mas sem vitrine. */
  active: boolean;
  vitrine: ConvenioVitrineProduct[];
};

/**
 * Benefício de convênio do cliente logado na loja online, pra "Meus Benefícios"
 * (`/loja/[subdomain]/conta`) — resolvido só por `Customer.convenioMemberId`
 * (referência direta criada no cadastro, ver `submitConvenioSignupAction`),
 * nunca por comparação de CPF/telefone.
 */
export async function getCustomerConvenioBenefit(
  customerId: string
): Promise<CustomerConvenioBenefit | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { convenioMemberId: true },
  });
  if (!customer?.convenioMemberId) return null;

  const member = await prisma.convenioMember.findUnique({
    where: { id: customer.convenioMemberId },
    select: {
      status: true,
      convenioId: true,
      convenio: { select: { name: true, active: true } },
    },
  });
  if (!member) return null;

  const active = member.status === "ACTIVE" && member.convenio.active;
  if (!active) return { convenioName: member.convenio.name, active: false, vitrine: [] };

  const discounts = await prisma.convenioProductDiscount.findMany({
    where: { convenioId: member.convenioId, product: { active: true, showInCatalog: true } },
    include: { product: { select: { id: true, name: true, catalogPrice: true } } },
    orderBy: { createdAt: "desc" },
  });

  const vitrine = discounts.map((d) => {
    const catalogPrice = Number(d.product.catalogPrice);
    const discountAmount = Number(d.discountAmount);
    return {
      productId: d.product.id,
      name: d.product.name,
      catalogPrice,
      discountAmount,
      finalPrice: Math.max(0, round2(catalogPrice - discountAmount)),
    };
  });

  return { convenioName: member.convenio.name, active: true, vitrine };
}

/**
 * Mapa productId → desconto (R$) pro cliente logado, usado no cálculo de
 * preço do carrinho/checkout (`resolveEffectiveUnitPrice`). Vazio (nunca
 * `null`) quando o cliente não tem convênio ativo — simplifica quem chama,
 * que só precisa de `.get(productId)`.
 */
export async function loadConvenioProductDiscounts(
  customerId: string | null,
  productIds: string[]
): Promise<Map<string, number>> {
  if (!customerId || productIds.length === 0) return new Map();

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { convenioMemberId: true },
  });
  if (!customer?.convenioMemberId) return new Map();

  const member = await prisma.convenioMember.findUnique({
    where: { id: customer.convenioMemberId },
    select: { status: true, convenioId: true, convenio: { select: { active: true } } },
  });
  if (!member || member.status !== "ACTIVE" || !member.convenio.active) return new Map();

  const discounts = await prisma.convenioProductDiscount.findMany({
    where: { convenioId: member.convenioId, productId: { in: productIds } },
    select: { productId: true, discountAmount: true },
  });
  return new Map(discounts.map((d) => [d.productId, Number(d.discountAmount)]));
}
