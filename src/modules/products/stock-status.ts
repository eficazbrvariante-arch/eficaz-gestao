type StockLevels = { stockQty: number; minStock: number };

/** Sem nenhuma unidade disponível. */
export function isOutOfStock({ stockQty }: StockLevels) {
  return stockQty <= 0;
}

/**
 * Abaixo (ou no limite) do estoque mínimo configurado.
 * Produtos sem mínimo definido (`minStock = 0`) nunca são considerados "baixos" —
 * a falta de unidades nesses casos é reportada como "esgotado".
 */
export function isLowStock({ stockQty, minStock }: StockLevels) {
  return minStock > 0 && stockQty <= minStock;
}

/** Precisa de reposição: esgotado ou abaixo do mínimo. */
export function needsRestock(levels: StockLevels) {
  return isOutOfStock(levels) || isLowStock(levels);
}

export function stockStatusLabel(levels: StockLevels): string | null {
  if (isOutOfStock(levels)) return "esgotado";
  if (isLowStock(levels)) return "estoque baixo";
  return null;
}
