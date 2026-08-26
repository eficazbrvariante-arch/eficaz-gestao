const EPSILON = 0.005;

export type CashDifferenceEntry = { label: string; difference: number };

export type CashDiagnosisPair = { shortLabel: string; surplusLabel: string; amount: number };

export type CashDiagnosis = {
  /** Soma do que sobrou (diferenças positivas) entre as formas. */
  totalSurplus: number;
  /** Soma do que faltou (diferenças negativas, em módulo) entre as formas. */
  totalDeficit: number;
  /** Parte da falta que pode ser explicada por sobra em outra forma — possível troca/lançamento na forma errada. */
  matched: number;
  /** O que sobra depois de descontar `matched`: falta (negativo) ou sobra (positivo) real, sem explicação por troca. */
  net: number;
  /** Sugestão de qual falta pareia com qual sobra, maior valor primeiro. */
  pairs: CashDiagnosisPair[];
};

/**
 * Cruza as diferenças (contado - esperado) de cada forma de pagamento pra separar
 * o que pode ser só uma venda lançada na forma errada (uma falta aqui + uma sobra
 * ali, do mesmo tamanho) do que é falta ou sobra real de dinheiro — que precisa de
 * investigação à parte. Só olha o total: não sabe qual venda específica foi.
 */
export function diagnoseCashDifferences(entries: CashDifferenceEntry[]): CashDiagnosis {
  const surplus = entries
    .filter((e) => e.difference > EPSILON)
    .map((e) => ({ label: e.label, remaining: e.difference }))
    .sort((a, b) => b.remaining - a.remaining);
  const deficit = entries
    .filter((e) => e.difference < -EPSILON)
    .map((e) => ({ label: e.label, remaining: -e.difference }))
    .sort((a, b) => b.remaining - a.remaining);

  const totalSurplus = surplus.reduce((sum, e) => sum + e.remaining, 0);
  const totalDeficit = deficit.reduce((sum, e) => sum + e.remaining, 0);
  const matched = Math.min(totalSurplus, totalDeficit);
  const net = totalSurplus - totalDeficit;

  const pairs: CashDiagnosisPair[] = [];
  let si = 0;
  let di = 0;
  while (si < surplus.length && di < deficit.length) {
    const amount = Math.min(surplus[si].remaining, deficit[di].remaining);
    if (amount > EPSILON) {
      pairs.push({ shortLabel: deficit[di].label, surplusLabel: surplus[si].label, amount });
    }
    surplus[si].remaining -= amount;
    deficit[di].remaining -= amount;
    if (surplus[si].remaining <= EPSILON) si++;
    if (deficit[di].remaining <= EPSILON) di++;
  }

  return { totalSurplus, totalDeficit, matched, net, pairs };
}
