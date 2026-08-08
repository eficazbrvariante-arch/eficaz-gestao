"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "./cart-context";
import { getCartPricingAction } from "@/app/loja/[subdomain]/checkout/actions";

/**
 * Revalida o carrinho contra o servidor uma vez ao montar (ver
 * `getCartPricingAction`) — preço e disponibilidade sempre em dia com o que
 * `createOrder` vai realmente cobrar, mesmo que o item tenha entrado no
 * carrinho numa visita anterior, ou a Oferta Relâmpago tenha mudado/expirado
 * nesse meio tempo. Usada por `/carrinho` e `/checkout`, os dois lugares
 * onde o preço exibido pode influenciar a decisão de compra.
 *
 * Devolve um aviso curto (ou `null`) para a tela mostrar quando algo mudou.
 */
export function useCartPriceSync(): string | null {
  const { subdomain, items, ready, reconcile, setQuantity } = useCart();
  const [notice, setNotice] = useState<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!ready || items.length === 0 || ranRef.current) return;
    ranRef.current = true;

    const request = items.map((line) => ({
      key: line.key,
      productId: line.productId,
      variantId: line.variantId,
    }));

    getCartPricingAction(subdomain, request).then((result) => {
      const updates: { key: string; unitPrice: number; stockQty: number }[] = [];
      const removeKeys: string[] = [];
      let priceChanged = false;

      for (const priced of result.items) {
        const current = items.find((line) => line.key === priced.key);
        if (!current) continue;

        if (!priced.available || priced.unitPrice === null) {
          removeKeys.push(priced.key);
          continue;
        }
        if (priced.unitPrice !== current.unitPrice) priceChanged = true;
        if (priced.unitPrice !== current.unitPrice || priced.stockQty !== current.stockQty) {
          updates.push({
            key: priced.key,
            unitPrice: priced.unitPrice,
            stockQty: priced.stockQty ?? current.stockQty,
          });
        }
      }

      if (updates.length > 0 || removeKeys.length > 0) {
        reconcile(updates, removeKeys);
      }

      // Recapa a quantidade da Oferta Relâmpago se o limite mudou (dia
      // virou, lojista editou): a cobrança final sempre recapa de novo no
      // servidor de qualquer forma — isto é só para a tela não mostrar uma
      // quantidade que o pedido não vai honrar.
      if (result.flashDeal) {
        const { productId, orderLimit } = result.flashDeal;
        let remaining = orderLimit;
        for (const line of items) {
          if (line.productId !== productId || removeKeys.includes(line.key)) continue;
          const capped = Math.min(line.quantity, remaining);
          if (capped !== line.quantity) setQuantity(line.key, Math.max(1, capped));
          remaining -= capped;
        }
      }

      if (removeKeys.length > 0) {
        setNotice(
          removeKeys.length === 1
            ? "Um item não está mais disponível e foi removido do carrinho."
            : `${removeKeys.length} itens não estão mais disponíveis e foram removidos do carrinho.`
        );
      } else if (priceChanged) {
        setNotice("Alguns preços foram atualizados para os valores atuais.");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, subdomain]);

  return notice;
}
