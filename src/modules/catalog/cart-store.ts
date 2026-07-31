export type CartItem = {
  /** Identidade da linha: produto + variação. */
  key: string;
  productId: string;
  variantId: string | null;
  name: string;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  imageUrl: string | null;
  /** Estoque disponível no momento em que o item foi adicionado. */
  stockQty: number;
};

export type CartSnapshot = {
  items: CartItem[];
  /** `false` até o carrinho ser lido do navegador (evita divergência na hidratação). */
  ready: boolean;
};

const EMPTY_SNAPSHOT: CartSnapshot = { items: [], ready: false };

function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.key === "string" &&
    typeof item.productId === "string" &&
    typeof item.name === "string" &&
    typeof item.unitPrice === "number" &&
    typeof item.quantity === "number" &&
    item.quantity > 0
  );
}

/**
 * Carrinho do visitante da loja, guardado no `localStorage`.
 *
 * Implementado como store externa (em vez de `useState` + efeito) para ser
 * consumido por `useSyncExternalStore`: assim a leitura do navegador não
 * dispara um `setState` durante o efeito de montagem, e o HTML do servidor
 * (carrinho vazio) hidrata sem divergência.
 *
 * Não há sessão no servidor para quem apenas navega: o pedido só chega ao banco
 * quando é finalizado, e os preços são reconferidos no servidor nesse momento.
 */
class CartStore {
  private snapshot: CartSnapshot = EMPTY_SNAPSHOT;
  private listeners = new Set<() => void>();
  private loaded = false;

  constructor(private readonly storageKey: string) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    this.loadOnce();
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  getServerSnapshot = () => EMPTY_SNAPSHOT;

  private loadOnce() {
    if (this.loaded) return;
    this.loaded = true;

    let items: CartItem[] = [];
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) items = parsed.filter(isCartItem);
      }
    } catch {
      // Carrinho corrompido ou localStorage indisponível: começa vazio.
    }

    this.snapshot = { items, ready: true };
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  private commit(items: CartItem[]) {
    this.snapshot = { items, ready: true };
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(items));
    } catch {
      // Sem espaço ou modo privativo: o carrinho segue apenas em memória.
    }
    this.emit();
  }

  addItem(item: Omit<CartItem, "key" | "quantity">, quantity = 1) {
    const key = `${item.productId}:${item.variantId ?? ""}`;
    const current = this.snapshot.items;
    const existing = current.find((line) => line.key === key);

    if (existing) {
      const next = Math.min(existing.quantity + quantity, item.stockQty);
      this.commit(
        current.map((line) =>
          line.key === key ? { ...line, quantity: next, stockQty: item.stockQty } : line
        )
      );
      return;
    }

    this.commit([...current, { ...item, key, quantity: Math.min(quantity, item.stockQty) }]);
  }

  setQuantity(key: string, quantity: number) {
    this.commit(
      this.snapshot.items.map((line) =>
        line.key === key
          ? { ...line, quantity: Math.min(Math.max(1, quantity), line.stockQty) }
          : line
      )
    );
  }

  removeItem(key: string) {
    this.commit(this.snapshot.items.filter((line) => line.key !== key));
  }

  clear() {
    this.commit([]);
  }
}

// Uma store por loja, compartilhada entre todos os componentes que a consomem.
const stores = new Map<string, CartStore>();

export function getCartStore(subdomain: string) {
  const key = `eficaz-gestao:carrinho:${subdomain}`;
  let store = stores.get(key);
  if (!store) {
    store = new CartStore(key);
    stores.set(key, store);
  }
  return store;
}
