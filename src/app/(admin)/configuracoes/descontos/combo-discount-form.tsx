"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormBanner } from "@/components/ui/form-banner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/format";
import { classifyComboItem, type ComboDiscountSettings } from "@/lib/combo-discount";
import { updateComboDiscountSettingsAction } from "./actions";

/**
 * Estado local simples em vez de react-hook-form: são quatro campos, a
 * validação que vale roda no servidor (`comboDiscountSettingsSchema`), e o
 * `watch()` do react-hook-form dispara o aviso "Compilation Skipped" do React
 * Compiler — que este formulário não precisa pagar só pra ler os valores no
 * testador ao vivo abaixo.
 */
function splitKeywords(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ComboDiscountForm({ settings }: { settings: ComboDiscountSettings }) {
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [isPending, startTransition] = useTransition();

  const [capinhaKeywords, setCapinhaKeywords] = useState(settings.capinhaKeywords.join(", "));
  const [hidrogelKeywords, setHidrogelKeywords] = useState(settings.hidrogelKeywords.join(", "));
  const [excludeKeywords, setExcludeKeywords] = useState(settings.excludeKeywords.join(", "));
  const [amountPerCombo, setAmountPerCombo] = useState(String(settings.amountPerCombo));
  const [testName, setTestName] = useState("");

  const parsedAmount = Number(amountPerCombo.replace(",", ".")) || 0;

  /**
   * Testador ao vivo: a pessoa cola o nome de um produto real do catálogo e vê
   * na hora como ele seria classificado. Sem isso, só dá pra descobrir que uma
   * palavra pegou demais (ou de menos) vendendo errado no balcão.
   */
  const testResult = useMemo(() => {
    if (!testName.trim()) return null;
    return classifyComboItem(testName, {
      capinhaKeywords: splitKeywords(capinhaKeywords),
      hidrogelKeywords: splitKeywords(hidrogelKeywords),
      excludeKeywords: splitKeywords(excludeKeywords),
      amountPerCombo: parsedAmount,
    });
  }, [testName, capinhaKeywords, hidrogelKeywords, excludeKeywords, parsedAmount]);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFeedback(undefined);
    startTransition(async () => {
      const result = await updateComboDiscountSettingsAction({
        capinhaKeywords,
        hidrogelKeywords,
        excludeKeywords,
        amountPerCombo: parsedAmount,
      });
      if (result?.error) setFeedback({ type: "error", message: result.error });
      else if (result?.success) setFeedback({ type: "success", message: result.success });
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div>
        <Label htmlFor="amountPerCombo">Desconto por combo (R$)</Label>
        <Input
          id="amountPerCombo"
          type="number"
          step="0.01"
          min="0"
          className="max-w-[200px]"
          value={amountPerCombo}
          onChange={(event) => setAmountPerCombo(event.target.value)}
        />
        <p className="mt-1 text-xs text-text-muted">
          Vale por par formado. 2 capinhas + 2 películas de hidrogel ={" "}
          <strong>{formatBRL(parsedAmount * 2)}</strong> de desconto. Zerar este campo desliga a
          regra.
        </p>
      </div>

      <div>
        <Label htmlFor="capinhaKeywords">Palavras que identificam a capinha</Label>
        <Input
          id="capinhaKeywords"
          value={capinhaKeywords}
          onChange={(event) => setCapinhaKeywords(event.target.value)}
        />
        <p className="mt-1 text-xs text-text-muted">
          Separe por vírgula. Não diferencia maiúscula de minúscula nem acento, e só casa a palavra
          inteira — &quot;capa&quot; não pega &quot;capacete&quot;.
        </p>
      </div>

      <div>
        <Label htmlFor="hidrogelKeywords">Palavras que identificam a película de hidrogel</Label>
        <Input
          id="hidrogelKeywords"
          value={hidrogelKeywords}
          onChange={(event) => setHidrogelKeywords(event.target.value)}
        />
        <p className="mt-1 text-xs text-text-muted">
          &quot;hidrogel&quot; já cobre &quot;hidrogél&quot; — o acento é ignorado na comparação.
        </p>
      </div>

      <div>
        <Label htmlFor="excludeKeywords">Palavras que excluem do combo</Label>
        <Input
          id="excludeKeywords"
          value={excludeKeywords}
          onChange={(event) => setExcludeKeywords(event.target.value)}
        />
        <p className="mt-1 text-xs text-text-muted">
          A exclusão vence sempre: um produto com uma destas palavras no nome não entra no combo,
          nem como capinha nem como película — mesmo que também tenha &quot;hidrogel&quot; escrito.
        </p>
      </div>

      <div className="rounded-lg border border-dashed border-border bg-surface-muted p-4">
        <Label htmlFor="testName">Testar um produto</Label>
        <Input
          id="testName"
          value={testName}
          onChange={(event) => setTestName(event.target.value)}
          placeholder="Cole aqui o nome de um produto do seu catálogo"
        />
        <p className="mt-2 text-sm" aria-live="polite">
          {!testName.trim() ? (
            <span className="text-text-muted">
              Digite um nome para ver como ele seria classificado.
            </span>
          ) : testResult === "capinha" ? (
            <span className="font-medium text-emerald-700">Conta como capinha.</span>
          ) : testResult === "hidrogel" ? (
            <span className="font-medium text-emerald-700">Conta como película de hidrogel.</span>
          ) : (
            <span className="font-medium text-amber-700">
              Não entra no combo — nenhum desconto por este item.
            </span>
          )}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          O teste usa o que está escrito nos campos acima, mesmo antes de salvar.
        </p>
      </div>

      <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
        {isPending ? "Salvando..." : "Salvar regra"}
      </Button>
    </form>
  );
}
