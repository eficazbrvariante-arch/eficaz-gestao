import { prisma } from "@/lib/prisma";
import type { CreateSaleInput } from "@/lib/validations/sale";
import { createFiadoEntry } from "@/modules/fiado/fiado-service";
import {
  allocateSellerDiscountBudget,
  getSellerDiscountRule,
  isCapinhaCategory,
  isPeliculaCategory,
} from "@/lib/seller-discount-rules";
import { revalidateConvenioMember } from "@/modules/convenios/convenio-redemption-service";
import { resolveProtecaoEficazRedemption } from "@/modules/protecao-eficaz/protecao-eficaz-service";
import { formatBRL } from "@/lib/format";

/** Tolerância para comparação de valores monetários (evita ruído de ponto flutuante). */
const CENT = 0.005;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type CreateSaleContext = {
  tenantId: string;
  sellerId: string;
  cashRegisterId: string;
  /** Se falso, qualquer desconto informado é rejeitado (exceto a exceção de película abaixo). */
  allowDiscount: boolean;
  /** Se falso, mesmo com `allowDiscount`, a película 3D continua presa à
   *  trava de capinha (ver `seller-discount-rules.ts`) — só ADMIN dispensa. */
  allowFreeDiscount: boolean;
  /** Se falso, pagamento com a forma "Fiado" é rejeitado. */
  allowFiado: boolean;
  /** Quem está operando o caixa (pode ser diferente de `sellerId`, o
   *  vendedor da comissão) — é quem fica registrado como autor do
   *  `FiadoEntry`, já que só ADMIN chega a este ponto com fiado > 0. */
  operatorId: string;
};

export type CreateSaleResult =
  | { ok: true; saleId: string; number: number; changeAmount: number }
  | { ok: false; error: string };

/**
 * Registra uma venda do PDV.
 *
 * Tudo acontece numa única transação: numeração sequencial, itens, pagamentos,
 * baixa de estoque e movimentações. Se qualquer passo falhar, nada é gravado —
 * o estoque nunca fica divergente de uma venda pela metade.
 *
 * O preço usado é o promocional quando existir, senão o de venda. O preço não vem
 * do cliente: é sempre relido do banco, para que ninguém consiga forjar valores.
 */
export async function createSale(
  ctx: CreateSaleContext,
  input: CreateSaleInput
): Promise<CreateSaleResult> {
  const productIds = [...new Set(input.items.map((i) => i.productId))];

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, tenantId: ctx.tenantId },
    include: { variants: true, category: { select: { name: true } } },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Desconto restrito do Vendedor (película 3D): cada capinha na venda
  // libera o desconto de uma película, nunca "qualquer quantidade de
  // película com uma capinha só" — checagem em cima dos itens da venda
  // inteira, não item a item isolado (ver `allocateSellerDiscountBudget`,
  // mesma lógica usada no PDV pra mostrar o teto ao vivo — precisa dar o
  // mesmo resultado nos dois lugares, já que aqui é a validação que vale de
  // verdade).
  const capinhaUnits = input.items.reduce((sum, item) => {
    const product = productMap.get(item.productId);
    const variant = item.variantId ? product?.variants.find((v) => v.id === item.variantId) : undefined;
    const basePrice = product ? Number(product.promoPrice ?? product.salePrice) : null;
    const isCapinha = isCapinhaCategory({
      categoryName: product?.category?.name,
      name: product?.name,
      unitPrice: basePrice == null ? null : round2(basePrice + Number(variant?.priceAdjustment ?? 0)),
    });
    return sum + (isCapinha ? item.quantity : 0);
  }, 0);

  // Proteção Eficaz: revalidada aqui de novo, nunca aceita só porque o PDV
  // mandou o campo marcado — só vale numa venda com capinha + película
  // juntas (ver `isPeliculaCategory`/`isCapinhaCategory`).
  if (input.protecaoEficazOptedIn) {
    const peliculaUnits = input.items.reduce((sum, item) => {
      const product = productMap.get(item.productId);
      return sum + (isPeliculaCategory(product?.category?.name) ? item.quantity : 0);
    }, 0);
    if (capinhaUnits === 0 || peliculaUnits === 0) {
      return {
        ok: false,
        error: "Proteção Eficaz só é válida numa venda com capinha e película juntas.",
      };
    }
  }

  // Troca gratuita da Proteção Eficaz aprovada: revalidada aqui de novo
  // (nunca confia na checagem prévia do PDV). Exige exatamente 1 película no
  // carrinho — nenhuma ambiguidade sobre qual linha fica grátis — e força o
  // desconto integral dessa linha mais abaixo, ignorando `item.discount`
  // vindo do cliente e sem passar pela trava normal de desconto do vendedor
  // (a autorização aqui vem do cadastro aprovado, não da permissão de
  // desconto de quem está vendendo).
  let protecaoEficazRedemptionRegistrationId: string | null = null;
  let protecaoEficazRedemptionItemIndex: number | null = null;
  if (input.protecaoEficazRedemptionSaleNumber) {
    const peliculaUnitsInCart = input.items.reduce((sum, item) => {
      const product = productMap.get(item.productId);
      return sum + (isPeliculaCategory(product?.category?.name) ? item.quantity : 0);
    }, 0);
    if (peliculaUnitsInCart !== 1) {
      return {
        ok: false,
        error: "A troca da Proteção Eficaz exige exatamente 1 película no carrinho.",
      };
    }

    const redemption = await resolveProtecaoEficazRedemption(
      ctx.tenantId,
      input.protecaoEficazRedemptionSaleNumber
    );
    if (!redemption.ok) return { ok: false, error: redemption.error };

    protecaoEficazRedemptionRegistrationId = redemption.registrationId;
    protecaoEficazRedemptionItemIndex = input.items.findIndex((item) => {
      const product = productMap.get(item.productId);
      return isPeliculaCategory(product?.category?.name);
    });
  }

  const sellerDiscountAllocation = allocateSellerDiscountBudget(
    input.items.map((item, index) => {
      const product = productMap.get(item.productId);
      const variant = item.variantId ? product?.variants.find((v) => v.id === item.variantId) : undefined;
      const basePrice = product ? Number(product.promoPrice ?? product.salePrice) : 0;
      return {
        key: String(index),
        name: product?.name ?? "",
        unitPrice: round2(basePrice + Number(variant?.priceAdjustment ?? 0)),
        quantity: item.quantity,
      };
    }),
    capinhaUnits
  );

  // Consolida quantidades por produto (o mesmo item pode vir repetido).
  const quantityByProduct = new Map<string, number>();
  for (const item of input.items) {
    quantityByProduct.set(
      item.productId,
      (quantityByProduct.get(item.productId) ?? 0) + item.quantity
    );
  }

  type ResolvedItem = {
    productId: string;
    variantId: string | null;
    nameSnapshot: string;
    quantity: number;
    unitPrice: number;
    unitCost: number;
    discount: number;
    total: number;
  };

  const resolvedItems: ResolvedItem[] = [];
  let subtotal = 0;
  let costTotal = 0;
  let discount = 0;

  for (const [itemIndex, item] of input.items.entries()) {
    const product = productMap.get(item.productId);
    if (!product) return { ok: false, error: "Produto não encontrado na venda." };
    if (!product.active) {
      return { ok: false, error: `O produto "${product.name}" está inativo.` };
    }

    const variant = item.variantId
      ? product.variants.find((v) => v.id === item.variantId)
      : undefined;
    if (item.variantId && !variant) {
      return { ok: false, error: `Variação inválida para "${product.name}".` };
    }

    const basePrice = Number(product.promoPrice ?? product.salePrice);
    const unitPrice = round2(basePrice + Number(variant?.priceAdjustment ?? 0));
    const unitCost = Number(product.costPrice);
    const grossTotal = round2(unitPrice * item.quantity);

    const isProtecaoEficazRedemptionItem = itemIndex === protecaoEficazRedemptionItemIndex;
    const itemDiscount = isProtecaoEficazRedemptionItem ? grossTotal : round2(item.discount ?? 0);
    if (!isProtecaoEficazRedemptionItem && itemDiscount > 0 && !ctx.allowFreeDiscount) {
      // Só ADMIN (allowFreeDiscount) tem desconto livre em qualquer item.
      // Vendedor e Gerente podem aplicar o desconto de segurança nas
      // películas 3D — só com uma capinha na venda e até o teto da regra
      // (ver `seller-discount-rules.ts`) — mesmo Gerente não escapa dessa
      // trava. Fora da película, Vendedor não desconta nada.
      const rule = getSellerDiscountRule(product.name, unitPrice);
      if (!rule) {
        if (!ctx.allowDiscount) {
          return { ok: false, error: `Seu perfil não pode conceder desconto em "${product.name}".` };
        }
      } else {
        const allocatedUnits = sellerDiscountAllocation.get(String(itemIndex)) ?? 0;
        if (allocatedUnits === 0) {
          return {
            ok: false,
            error:
              capinhaUnits === 0
                ? `O desconto em "${product.name}" só é permitido com uma capinha na venda.`
                : `O desconto em "${product.name}" excede a quantidade de capinhas na venda — cada capinha libera o desconto de uma película.`,
          };
        }
        const maxLineDiscount = round2(allocatedUnits * rule.maxDiscountPerUnit);
        if (itemDiscount > maxLineDiscount + CENT) {
          return {
            ok: false,
            error: `O desconto máximo em "${product.name}" é ${formatBRL(maxLineDiscount)}.`,
          };
        }
      }
    }
    if (itemDiscount > grossTotal + CENT) {
      return {
        ok: false,
        error: `O desconto de "${product.name}" não pode ser maior que o valor do item.`,
      };
    }

    const total = round2(grossTotal - itemDiscount);

    resolvedItems.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      nameSnapshot: variant ? `${product.name} (${variant.name})` : product.name,
      quantity: item.quantity,
      unitPrice,
      unitCost,
      discount: itemDiscount,
      total,
    });

    subtotal = round2(subtotal + grossTotal);
    discount = round2(discount + itemDiscount);
    costTotal = round2(costTotal + unitCost * item.quantity);
  }

  // Benefício de Convênio Corporativo — revalidado aqui de novo (status,
  // convênio ativo, limite de uso do período), nunca só porque o PDV já
  // validou antes de montar o carrinho: o tempo entre escanear e pagar pode
  // ter mudado o status. Nunca reduz `discount` nem o desconto de item algum
  // — `convenioDiscount` é separado de propósito, pra não afetar a comissão
  // do vendedor (calculada em cima de `SaleItem.total`, intocado aqui).
  let convenioMember: { id: string; name: string; convenioId: string } | null = null;
  let convenioDiscount = 0;
  if (input.convenioMemberId) {
    const result = await revalidateConvenioMember(ctx.tenantId, input.convenioMemberId);
    if (!result.ok) return { ok: false, error: result.error };
    convenioMember = { ...result.member, convenioId: result.convenio.id };
    convenioDiscount = round2(Math.min(result.benefitAmount, round2(subtotal - discount)));
  }

  const total = round2(subtotal - discount - convenioDiscount);

  // Abaixo de zero total (ex.: troca 100% grátis da Proteção Eficaz), não há
  // forma de pagamento nenhuma pra exigir — só acima de zero é obrigatório
  // informar pelo menos uma (o schema não trava isso porque não conhece o
  // total, calculado aqui a partir dos itens).
  if (input.payments.length === 0 && total > CENT) {
    return { ok: false, error: "Informe a forma de pagamento." };
  }

  const paidAmount = round2(input.payments.reduce((sum, p) => sum + p.amount, 0));
  if (Math.abs(paidAmount - total) > CENT) {
    return {
      ok: false,
      error: `A soma dos pagamentos (${paidAmount.toFixed(2)}) não corresponde ao total da venda (${total.toFixed(2)}).`,
    };
  }

  // Troco: só faz sentido quando parte do pagamento é em dinheiro.
  const cashPortion = round2(
    input.payments.filter((p) => p.method === "CASH").reduce((sum, p) => sum + p.amount, 0)
  );
  let changeAmount = 0;
  let cashReceived: number | null = null;

  if (cashPortion > 0 && input.cashReceived !== undefined) {
    cashReceived = round2(input.cashReceived);
    if (cashReceived + CENT < cashPortion) {
      return { ok: false, error: "O valor recebido em dinheiro é menor que a parcela em espécie." };
    }
    changeAmount = round2(cashReceived - cashPortion);
  }

  const customerId = input.customerId || null;

  const assistantSellerId = input.assistantSellerId || null;
  if (assistantSellerId) {
    const assistant = await prisma.user.findFirst({
      where: { id: assistantSellerId, tenantId: ctx.tenantId, active: true },
      select: { id: true },
    });
    if (!assistant) return { ok: false, error: "Auxiliar de venda não encontrado." };
  }

  const storeCreditAmount = round2(
    input.payments.filter((p) => p.method === "STORE_CREDIT").reduce((sum, p) => sum + p.amount, 0)
  );

  let customerCreditBalance = 0;
  if (customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId: ctx.tenantId },
      select: { id: true, creditBalance: true },
    });
    if (!customer) return { ok: false, error: "Cliente não encontrado." };
    customerCreditBalance = Number(customer.creditBalance);
  }

  if (storeCreditAmount > 0) {
    if (!customerId) {
      return { ok: false, error: "Selecione um cliente para usar crédito de loja." };
    }
    if (storeCreditAmount > customerCreditBalance + CENT) {
      return {
        ok: false,
        error: `Crédito de loja insuficiente. Saldo disponível: ${customerCreditBalance.toFixed(2)}.`,
      };
    }
  }

  const fiadoAmount = round2(
    input.payments.filter((p) => p.method === "FIADO").reduce((sum, p) => sum + p.amount, 0)
  );
  if (fiadoAmount > 0) {
    if (!ctx.allowFiado) {
      return { ok: false, error: "Seu perfil não tem permissão para vender fiado." };
    }
    if (!customerId) {
      return { ok: false, error: "Selecione um cliente para vender fiado." };
    }
    if (!input.fiadoDueDate) {
      return { ok: false, error: "Informe a data prevista de pagamento do fiado." };
    }
  }

  try {
    const sale = await prisma.$transaction(async (tx) => {
      // Incremento atômico garante numeração única mesmo com vendas simultâneas.
      const tenant = await tx.tenant.update({
        where: { id: ctx.tenantId },
        data: { saleSequence: { increment: 1 } },
        select: { saleSequence: true },
      });

      const created = await tx.sale.create({
        data: {
          tenantId: ctx.tenantId,
          number: tenant.saleSequence,
          cashRegisterId: ctx.cashRegisterId,
          customerId,
          sellerId: ctx.sellerId,
          assistantSellerId,
          subtotal,
          discount,
          convenioDiscount,
          total,
          costTotal,
          cashReceived,
          changeAmount,
          protecaoEficazOptedIn: input.protecaoEficazOptedIn ?? false,
          notes: input.notes || null,
          items: {
            create: resolvedItems.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              nameSnapshot: item.nameSnapshot,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitCost: item.unitCost,
              discount: item.discount,
              total: item.total,
            })),
          },
          payments: {
            create: input.payments.map((p) => ({
              method: p.method,
              amount: round2(p.amount),
            })),
          },
        },
        select: { id: true, number: true },
      });

      for (const [productId, quantity] of quantityByProduct) {
        await tx.product.update({
          where: { id: productId },
          data: { stockQty: { decrement: quantity } },
        });
        await tx.stockMovement.create({
          data: {
            tenantId: ctx.tenantId,
            productId,
            type: "SALE",
            quantity: -quantity,
            reason: `Venda #${created.number}`,
            userId: ctx.sellerId,
            saleId: created.id,
          },
        });
      }

      // Baixa também o estoque da variação, quando informada.
      for (const item of resolvedItems) {
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stockQty: { decrement: item.quantity } },
          });
        }
      }

      if (customerId) {
        await tx.customer.update({
          where: { id: customerId },
          data: {
            totalSpent: { increment: total },
            lastPurchaseAt: new Date(),
          },
        });
      }

      if (storeCreditAmount > 0 && customerId) {
        await tx.customer.update({
          where: { id: customerId },
          data: { creditBalance: { decrement: storeCreditAmount } },
        });
        await tx.customerCreditMovement.create({
          data: {
            tenantId: ctx.tenantId,
            customerId,
            type: "REDEEMED",
            amount: storeCreditAmount,
            saleId: created.id,
            userId: ctx.sellerId,
            reason: `Usado como pagamento na venda #${created.number}`,
          },
        });
      }

      if (fiadoAmount > 0 && customerId) {
        await createFiadoEntry(
          ctx.tenantId,
          {
            customerId,
            amount: fiadoAmount,
            dueDate: input.fiadoDueDate,
            saleId: created.id,
            createdById: ctx.operatorId,
            note: `Venda #${created.number}`,
          },
          tx
        );
      }

      if (convenioMember) {
        await tx.convenioRedemption.create({
          data: {
            tenantId: ctx.tenantId,
            convenioId: convenioMember.convenioId,
            memberId: convenioMember.id,
            saleId: created.id,
            sellerId: ctx.sellerId,
            cashRegisterId: ctx.cashRegisterId,
            benefitAmount: convenioDiscount,
          },
        });
      }

      if (protecaoEficazRedemptionRegistrationId) {
        // `redeemedAt: null` na condição fecha a corrida rara de duas vendas
        // simultâneas tentando trocar o mesmo cadastro — só uma ganha, a
        // outra derruba a transação inteira (nada é gravado pela metade).
        const redeemed = await tx.protecaoEficaz.updateMany({
          where: { id: protecaoEficazRedemptionRegistrationId, redeemedAt: null },
          data: { redeemedAt: new Date(), redeemedById: ctx.operatorId },
        });
        if (redeemed.count === 0) {
          throw new Error("Essa Proteção Eficaz já foi trocada em outra venda.");
        }
      }

      return created;
    });

    return { ok: true, saleId: sale.id, number: sale.number, changeAmount };
  } catch (error) {
    if (protecaoEficazRedemptionRegistrationId && error instanceof Error) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Não foi possível registrar a venda. Tente novamente." };
  }
}

export type CancelSaleResult = { ok: true } | { ok: false; error: string };

/**
 * Cancela uma venda concluída, devolvendo o estoque e revertendo o total do cliente.
 * A venda permanece no histórico com status CANCELLED e a justificativa registrada.
 */
export async function cancelSale(
  tenantId: string,
  saleId: string,
  userId: string,
  reason: string,
  /** Só é usado quando a venda ainda não tem cliente vinculado — obrigatório
   *  nesse caso (a menos que `skipCredit`), pois é pra ele que o crédito do
   *  cancelamento é gerado. */
  creditCustomerId?: string | null,
  /**
   * Cancelamento administrativo (só ADMIN, checado na action): não exige
   * cliente nenhum e não gera crédito de loja pra ninguém — pra quando a
   * venda simplesmente não deveria ter existido (erro de lançamento,
   * duplicidade), sem dever nada a ninguém. Estoque, reversão de convênio e
   * o registro do cancelamento em si continuam acontecendo normalmente.
   */
  skipCredit = false
): Promise<CancelSaleResult> {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, tenantId },
    include: { items: true },
  });
  if (!sale) return { ok: false, error: "Venda não encontrada." };
  if (sale.status === "CANCELLED") return { ok: false, error: "Esta venda já está cancelada." };

  const customerId = skipCredit ? null : (sale.customerId ?? creditCustomerId ?? null);
  if (!skipCredit && !customerId) {
    return {
      ok: false,
      error: "Selecione o cliente da venda para gerar o crédito do cancelamento.",
    };
  }
  // A partir daqui, sempre que `!skipCredit`, `customerId` é garantidamente
  // não-nulo (checado acima) — só o TypeScript não consegue provar isso a
  // partir de duas variáveis distintas, daí os `customerId!` abaixo.

  if (!skipCredit && !sale.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId!, tenantId },
      select: { id: true },
    });
    if (!customer) return { ok: false, error: "Cliente não encontrado." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledById: userId,
          cancelReason: reason,
          // Se a venda era de "consumidor final", o cliente escolhido agora pra
          // receber o crédito fica registrado retroativamente na própria venda.
          // Cancelamento administrativo sem crédito nunca precisa disso.
          ...(sale.customerId || skipCredit ? {} : { customerId }),
        },
      });

      const quantityByProduct = new Map<string, number>();
      for (const item of sale.items) {
        quantityByProduct.set(
          item.productId,
          (quantityByProduct.get(item.productId) ?? 0) + item.quantity
        );
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stockQty: { increment: item.quantity } },
          });
        }
      }

      for (const [productId, quantity] of quantityByProduct) {
        await tx.product.update({
          where: { id: productId },
          data: { stockQty: { increment: quantity } },
        });
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId,
            type: "CANCEL_RETURN",
            quantity,
            reason: `Cancelamento da venda #${sale.number}`,
            userId,
            saleId: sale.id,
          },
        });
      }

      if (sale.customerId) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { totalSpent: { decrement: sale.total } },
        });
      }

      if (!skipCredit) {
        await tx.customer.update({
          where: { id: customerId! },
          data: { creditBalance: { increment: sale.total } },
        });
        await tx.customerCreditMovement.create({
          data: {
            tenantId,
            customerId: customerId!,
            type: "GRANTED",
            amount: sale.total,
            saleId: sale.id,
            userId,
            reason: `Cancelamento da venda #${sale.number}`,
          },
        });
      }

      // Venda cancelada não pode continuar contando pro limite de uso do
      // colaborador nem pros totais do convênio — reverte sem apagar o
      // registro histórico (ver `ConvenioRedemption.reversedAt`).
      await tx.convenioRedemption.updateMany({
        where: { saleId: sale.id, reversedAt: null },
        data: { reversedAt: new Date(), reversedReason: `Venda #${sale.number} cancelada` },
      });
    });

    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível cancelar a venda. Tente novamente." };
  }
}

export type EditSaleItemInput = { itemId: string; unitPrice: number; discount: number };
export type EditSaleItemChange = {
  nameSnapshot: string;
  before: { unitPrice: number; discount: number };
  after: { unitPrice: number; discount: number };
};
export type EditSaleResult =
  | { ok: true; changes: EditSaleItemChange[] }
  | { ok: false; error: string };

/**
 * Corrige preço unitário e/ou desconto de itens já vendidos — nunca troca
 * produto, quantidade, nem adiciona/remove linha. O total da venda (o que o
 * cliente já pagou) precisa continuar exatamente igual: a correção só
 * redistribui valor entre itens (ex.: um item estava caro demais, outro
 * barato demais), nunca gera saldo a cobrar ou a devolver — isso é troca ou
 * cancelamento, não edição. Bloqueada se o caixa da venda já fechou, pra não
 * mudar um relatório de caixa que já foi conferido.
 */
export async function editSaleItems(
  tenantId: string,
  saleId: string,
  userId: string,
  edits: EditSaleItemInput[]
): Promise<EditSaleResult> {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, tenantId },
    include: { items: true, cashRegister: { select: { status: true } } },
  });
  if (!sale) return { ok: false, error: "Venda não encontrada." };
  if (sale.status === "CANCELLED") {
    return { ok: false, error: "Venda cancelada não pode ser editada." };
  }
  if (sale.cashRegister.status !== "OPEN") {
    return { ok: false, error: "O caixa desta venda já foi fechado — não é possível editar." };
  }

  const editByItemId = new Map(edits.map((e) => [e.itemId, e]));
  const changes: { itemId: string; nameSnapshot: string; before: { unitPrice: number; discount: number }; unitPrice: number; discount: number; total: number }[] = [];

  let newSubtotal = 0;
  let newDiscount = 0;

  for (const item of sale.items) {
    const edit = editByItemId.get(item.id);
    const unitPrice = edit ? round2(edit.unitPrice) : Number(item.unitPrice);
    const itemDiscount = edit ? round2(edit.discount) : Number(item.discount);
    if (unitPrice < 0 || itemDiscount < 0) {
      return { ok: false, error: "Valores não podem ser negativos." };
    }
    const grossTotal = round2(unitPrice * item.quantity);
    if (itemDiscount > grossTotal + CENT) {
      return {
        ok: false,
        error: `O desconto de "${item.nameSnapshot}" não pode ser maior que o valor do item.`,
      };
    }
    const total = round2(grossTotal - itemDiscount);
    newSubtotal = round2(newSubtotal + grossTotal);
    newDiscount = round2(newDiscount + itemDiscount);

    if (edit) {
      changes.push({
        itemId: item.id,
        nameSnapshot: item.nameSnapshot,
        before: { unitPrice: Number(item.unitPrice), discount: Number(item.discount) },
        unitPrice,
        discount: itemDiscount,
        total,
      });
    }
  }

  if (changes.length === 0) return { ok: false, error: "Nenhuma alteração informada." };

  const newTotal = round2(newSubtotal - newDiscount - Number(sale.convenioDiscount));
  if (Math.abs(newTotal - Number(sale.total)) > CENT) {
    return {
      ok: false,
      error: `Essa correção mudaria o total da venda de ${formatBRL(Number(sale.total))} para ${formatBRL(newTotal)} — ajuste os valores até o total ficar igual ao original.`,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const change of changes) {
        await tx.saleItem.update({
          where: { id: change.itemId },
          data: { unitPrice: change.unitPrice, discount: change.discount, total: change.total },
        });
      }
      await tx.sale.update({
        where: { id: saleId },
        data: {
          subtotal: newSubtotal,
          discount: newDiscount,
          editedAt: new Date(),
          editedById: userId,
        },
      });
    });

    return {
      ok: true,
      changes: changes.map((c) => ({
        nameSnapshot: c.nameSnapshot,
        before: c.before,
        after: { unitPrice: c.unitPrice, discount: c.discount },
      })),
    };
  } catch {
    return { ok: false, error: "Não foi possível salvar a correção. Tente novamente." };
  }
}

export type ReportSaleItemDefectResult = { ok: true } | { ok: false; error: string };

/**
 * Registra a troca de um item específico por defeito — não mexe no restante
 * da venda (total/subtotal do comprovante ficam intactos, como fato
 * histórico). Gera crédito de loja só do valor daquele item e some da
 * quantidade "trocável" restante (não dá pra reportar mais unidades do que
 * foram compradas). O produto NÃO volta ao estoque vendável — fica de fora
 * até alguém avaliar/ajustar manualmente (ver comentário em `SaleItemDefect`
 * no schema).
 */
export async function reportSaleItemDefect(
  tenantId: string,
  saleId: string,
  userId: string,
  input: {
    saleItemId: string;
    quantity: number;
    reason: string;
    photoUrls: string[];
    /** Só é usado quando a venda ainda não tem cliente vinculado. */
    creditCustomerId?: string | null;
  }
): Promise<ReportSaleItemDefectResult> {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, tenantId },
    include: { items: { include: { defects: true } } },
  });
  if (!sale) return { ok: false, error: "Venda não encontrada." };
  if (sale.status === "CANCELLED") {
    return { ok: false, error: "Esta venda está cancelada — não dá pra trocar itens dela." };
  }

  const item = sale.items.find((i) => i.id === input.saleItemId);
  if (!item) return { ok: false, error: "Item não encontrado nesta venda." };

  const alreadyReported = item.defects.reduce((sum, d) => sum + d.quantity, 0);
  const remaining = item.quantity - alreadyReported;
  if (input.quantity > remaining) {
    return {
      ok: false,
      error:
        remaining <= 0
          ? "Todas as unidades deste item já foram trocadas por defeito."
          : `Só dá pra trocar até ${remaining} unidade(s) restante(s) deste item.`,
    };
  }

  const customerId = sale.customerId ?? input.creditCustomerId ?? null;
  if (!customerId) {
    return {
      ok: false,
      error: "Selecione o cliente da venda para gerar o crédito da troca.",
    };
  }
  if (!sale.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { id: true },
    });
    if (!customer) return { ok: false, error: "Cliente não encontrado." };
  }

  const creditAmount = round2(Number(item.unitPrice) * input.quantity);

  try {
    await prisma.$transaction(async (tx) => {
      if (!sale.customerId) {
        await tx.sale.update({ where: { id: sale.id }, data: { customerId } });
      }

      await tx.saleItemDefect.create({
        data: {
          tenantId,
          saleId: sale.id,
          saleItemId: item.id,
          quantity: input.quantity,
          reason: input.reason,
          creditAmount,
          reportedById: userId,
          photos: { create: input.photoUrls.map((url, order) => ({ url, order })) },
        },
      });

      await tx.customer.update({
        where: { id: customerId },
        data: {
          creditBalance: { increment: creditAmount },
          ...(sale.customerId ? { totalSpent: { decrement: creditAmount } } : {}),
        },
      });
      await tx.customerCreditMovement.create({
        data: {
          tenantId,
          customerId,
          type: "GRANTED",
          amount: creditAmount,
          saleId: sale.id,
          userId,
          reason: `Troca por defeito · venda #${sale.number} · ${item.nameSnapshot}`,
        },
      });
    });

    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível registrar a troca. Tente novamente." };
  }
}
