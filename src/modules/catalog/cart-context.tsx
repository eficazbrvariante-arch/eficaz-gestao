"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import { getCartStore, type CartItem } from "./cart-store";

export type { CartItem };

/** Produto + limite da Oferta Relâmpago vigente hoje, ou `null` sem oferta ativa. */
export type FlashDealCartRule = { productId: string; orderLimit: number } | null;

type CartContextValue = {
  subdomain: string;
  flashDeal: FlashDealCartRule;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({
  subdomain,
  flashDeal = null,
  children,
}: {
  subdomain: string;
  flashDeal?: FlashDealCartRule;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ subdomain, flashDeal }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subdomain, flashDeal?.productId, flashDeal?.orderLimit]
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart precisa estar dentro de <CartProvider>.");
  }
  const { subdomain, flashDeal } = ctx;

  const store = getCartStore(subdomain);
  const { items, ready } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot
  );

  const totals = useMemo(() => {
    const itemCount = items.reduce((sum, line) => sum + line.quantity, 0);
    const subtotal =
      Math.round(items.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0) * 100) / 100;
    return { itemCount, subtotal };
  }, [items]);

  /**
   * Oferta Relâmpago: o produto ativo hoje só pode chegar ao limite
   * configurado no carrinho (padrão 1), somado entre todas as linhas dele
   * (ex.: duas variações do mesmo produto) — a regra vale só para esse
   * produto, nunca para o resto do carrinho. `capped` avisa o chamador para
   * mostrar a mensagem amigável.
   */
  function addItem(item: Omit<CartItem, "key" | "quantity">, quantity = 1): { capped: boolean } {
    if (flashDeal && item.productId === flashDeal.productId) {
      const used = items.reduce(
        (sum, line) => (line.productId === flashDeal.productId ? sum + line.quantity : sum),
        0
      );
      const allowed = Math.max(0, flashDeal.orderLimit - used);
      const finalQty = Math.min(quantity, allowed);
      if (finalQty > 0) store.addItem(item, finalQty);
      return { capped: finalQty < quantity };
    }
    store.addItem(item, quantity);
    return { capped: false };
  }

  function setQuantity(key: string, quantity: number): { capped: boolean } {
    const line = items.find((l) => l.key === key);
    if (flashDeal && line?.productId === flashDeal.productId) {
      const usedByOthers = items.reduce(
        (sum, l) => (l.key !== key && l.productId === flashDeal.productId ? sum + l.quantity : sum),
        0
      );
      const allowed = Math.max(1, flashDeal.orderLimit - usedByOthers);
      const clamped = Math.min(Math.max(1, quantity), allowed);
      store.setQuantity(key, clamped);
      return { capped: clamped < quantity };
    }
    store.setQuantity(key, Math.max(1, quantity));
    return { capped: false };
  }

  return {
    items,
    ready,
    ...totals,
    addItem,
    setQuantity,
    removeItem: store.removeItem.bind(store),
    clear: store.clear.bind(store),
    flashDealProductId: flashDeal?.productId ?? null,
    flashDealOrderLimit: flashDeal?.orderLimit ?? null,
  };
}
