import { diagnoseCashDifferences, type CashDifferenceEntry } from "@/lib/cash-diagnosis";
import { formatBRL } from "@/lib/format";

/**
 * Cruza sobra numa forma de pagamento com falta em outra — pista de que uma
 * venda foi lançada na forma errada — e mostra o que sobra sem explicação
 * (falta ou sobra real, que não é troca entre formas e precisa de
 * investigação à parte). Não renderiza nada se todas as formas baterem.
 */
export function CashDiagnosisCard({ entries }: { entries: CashDifferenceEntry[] }) {
  const diagnosis = diagnoseCashDifferences(entries);
  const hasDifference = diagnosis.totalSurplus > 0.005 || diagnosis.totalDeficit > 0.005;
  if (!hasDifference) return null;

  const netIsDeficit = diagnosis.net < -0.005;
  const netIsSurplus = diagnosis.net > 0.005;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-slate-900">Diagnóstico de diferenças</h2>
      <p className="mb-3 text-xs text-slate-500">
        Cruza sobra numa forma com falta em outra — pode indicar venda lançada na forma errada.
      </p>

      {diagnosis.pairs.length > 0 && (
        <ul className="mb-3 space-y-1 text-sm text-slate-700">
          {diagnosis.pairs.map((pair, i) => (
            <li key={i}>
              <span className="font-medium text-amber-700">{formatBRL(pair.amount)}</span> entre{" "}
              <span className="font-medium">{pair.shortLabel}</span> (faltou) e{" "}
              <span className="font-medium">{pair.surplusLabel}</span> (sobrou) — possível venda
              lançada na forma errada.
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-slate-100 pt-2 text-sm font-medium">
        {netIsDeficit && (
          <p className="text-red-600">
            Falta real (não explicada por troca entre formas): {formatBRL(Math.abs(diagnosis.net))}
          </p>
        )}
        {netIsSurplus && (
          <p className="text-emerald-700">
            Sobra real (não explicada por troca entre formas): {formatBRL(diagnosis.net)}
          </p>
        )}
        {!netIsDeficit && !netIsSurplus && (
          <p className="text-emerald-700">
            Toda a diferença entre as formas pode ser explicada por troca — nenhuma falta ou sobra
            real de dinheiro sobrando.
          </p>
        )}
      </div>
    </div>
  );
}
