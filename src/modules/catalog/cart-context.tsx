"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import { getCartStore, type CartItem } from "./cart-store";

export type { CartItem };

const CartSubdomainContext = createContext<string | null>(null);

export function CartProvider({
  subdomain,
  children,
}: {
  subdomain: string;
  children: React.ReactNode;
}) {
  return (
    <CartSubdomainContext.Provider value={subdomain}>{children}</CartSubdomainContext.Provider>
  );
}

export function useCart() {
  const subdomain = useContext(CartSubdomainContext);
  if (!subdomain) {
    throw new Error("useCart precisa estar dentro de <CartProvider>.");
  }

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

  return {
    items,
    ready,
    ...totals,
    addItem: store.addItem.bind(store),
    setQuantity: store.setQuantity.bind(store),
    removeItem: store.removeItem.bind(store),
    clear: store.clear.bind(store),
  };
}
