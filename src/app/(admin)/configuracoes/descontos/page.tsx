import { requireTenant } from "@/lib/session";
import { parseComboDiscountSettings } from "@/lib/combo-discount";
import { ComboDiscountForm } from "./combo-discount-form";

export default async function ConfiguracoesDescontosPage() {
  const { tenant } = await requireTenant();
  const settings = parseComboDiscountSettings(tenant.comboDiscountSettings);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-foreground">
        Descontos: combo capinha + película
      </h1>
      <p className="mb-6 max-w-3xl text-sm text-text-muted">
        Quando a venda tiver, ao mesmo tempo, uma capinha e uma película de hidrogel, o desconto é
        aplicado sozinho no PDV — o vendedor não precisa fazer nada. O desconto vale por par: 2
        capinhas + 2 películas contam como 2 combos. Se o combo se desfizer no carrinho, o desconto
        sai sozinho.
      </p>

      <div className="max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <ComboDiscountForm settings={settings} />
      </div>

      <p className="mt-4 max-w-3xl text-xs text-text-muted">
        Este desconto é somado ao desconto que o vendedor lançar à mão, nunca substitui. Ele não
        reduz a comissão do vendedor e fica guardado separado do desconto manual, para os
        relatórios distinguirem promoção automática de negociação no balcão.
      </p>
    </div>
  );
}
