import { describe, expect, it } from "vitest";
import { getCartStore } from "./cart-store";

/**
 * `CartStore` só usa `window.localStorage.getItem`/`setItem` — um fake mínimo
 * em memória é suficiente, sem precisar de jsdom (o projeto não tem essa
 * dependência e este é o único módulo que precisa de `window` em teste).
 */
type FakeWindow = { localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void } };

function installFakeWindow() {
  const map = new Map<string, string>();
  const fakeWindow: FakeWindow = {
    localStorage: {
      getItem: (key) => (map.has(key) ? map.get(key)! : null),
      setItem: (key, value) => {
        map.set(key, value);
      },
    },
  };
  (globalThis as unknown as { window: FakeWindow }).window = fakeWindow;
}

installFakeWindow();

let storeCounter = 0;
/** Cada teste usa um subdomínio novo — `getCartStore` guarda uma store por chave, então isso isola os testes entre si. */
function freshStore() {
  storeCounter += 1;
  return getCartStore(`test-subdomain-${storeCounter}`);
}

const ITEM_A = { productId: "p1", variantId: null, name: "Produto 1", variantName: null, unitPrice: 10, imageUrl: null, stockQty: 5 };

describe("CartStore.addItem", () => {
  it("adiciona um item novo", () => {
    const store = freshStore();
    store.addItem(ITEM_A, 2);
    expect(store.getSnapshot().items).toEqual([{ ...ITEM_A, key: "p1:", quantity: 2 }]);
  });

  it("soma a quantidade ao readicionar a mesma linha", () => {
    const store = freshStore();
    store.addItem(ITEM_A, 1);
    store.addItem(ITEM_A, 2);
    expect(store.getSnapshot().items[0].quantity).toBe(3);
  });

  it("atualiza o preço ao readicionar a mesma linha com um preço diferente (bug corrigido: preço não fica mais congelado)", () => {
    const store = freshStore();
    store.addItem({ ...ITEM_A, unitPrice: 15.99 }, 1);
    store.addItem({ ...ITEM_A, unitPrice: 3.99 }, 1);
    const item = store.getSnapshot().items[0];
    expect(item.unitPrice).toBe(3.99);
    expect(item.quantity).toBe(2);
  });

  it("trata produto+variante como linhas distintas", () => {
    const store = freshStore();
    store.addItem({ ...ITEM_A, variantId: "v1", variantName: "Azul" });
    store.addItem({ ...ITEM_A, variantId: "v2", variantName: "Vermelho", unitPrice: 12 });
    expect(store.getSnapshot().items).toHaveLength(2);
  });
});

describe("CartStore.reconcile", () => {
  it("atualiza preço e estoque das linhas informadas", () => {
    const store = freshStore();
    store.addItem({ ...ITEM_A, unitPrice: 15.99 }, 1);
    const key = store.getSnapshot().items[0].key;

    store.reconcile([{ key, unitPrice: 3.99, stockQty: 2 }], []);

    const item = store.getSnapshot().items[0];
    expect(item.unitPrice).toBe(3.99);
    expect(item.stockQty).toBe(2);
  });

  it("remove linhas que não existem mais no catálogo", () => {
    const store = freshStore();
    store.addItem(ITEM_A, 1);
    const key = store.getSnapshot().items[0].key;

    store.reconcile([], [key]);

    expect(store.getSnapshot().items).toHaveLength(0);
  });

  it("não faz nada (nem dispara commit) quando não há atualização nem remoção", () => {
    const store = freshStore();
    store.addItem(ITEM_A, 1);
    const before = store.getSnapshot();

    store.reconcile([], []);

    expect(store.getSnapshot()).toBe(before);
  });

  it("não mexe em linhas que não foram informadas", () => {
    const store = freshStore();
    store.addItem(ITEM_A, 1);
    store.addItem({ ...ITEM_A, productId: "p2" }, 1);
    const [keyA] = store.getSnapshot().items.map((i) => i.key);

    store.reconcile([{ key: keyA, unitPrice: 999, stockQty: 1 }], []);

    const other = store.getSnapshot().items.find((i) => i.productId === "p2")!;
    expect(other.unitPrice).toBe(10);
  });
});

describe("CartStore.setQuantity", () => {
  it("nunca deixa a quantidade menor que 1", () => {
    const store = freshStore();
    store.addItem(ITEM_A, 1);
    const key = store.getSnapshot().items[0].key;

    store.setQuantity(key, 0);

    expect(store.getSnapshot().items[0].quantity).toBe(1);
  });
});

describe("CartStore.removeItem / clear", () => {
  it("removeItem tira só a linha certa", () => {
    const store = freshStore();
    store.addItem(ITEM_A, 1);
    store.addItem({ ...ITEM_A, productId: "p2" }, 1);
    const key = store.getSnapshot().items[0].key;

    store.removeItem(key);

    expect(store.getSnapshot().items).toHaveLength(1);
    expect(store.getSnapshot().items[0].productId).toBe("p2");
  });

  it("clear esvazia o carrinho inteiro", () => {
    const store = freshStore();
    store.addItem(ITEM_A, 1);
    store.addItem({ ...ITEM_A, productId: "p2" }, 1);

    store.clear();

    expect(store.getSnapshot().items).toHaveLength(0);
  });
});
