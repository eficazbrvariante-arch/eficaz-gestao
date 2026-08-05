/**
 * Conjunto fixo de ícones disponíveis para categorias, usado pelo seletor no
 * painel (`category-form.tsx`) e pelo registro de ícones da loja
 * (`src/app/loja/[subdomain]/icons.tsx`). Compartilhado sem depender de React
 * para poder ser importado tanto no formulário quanto no serviço.
 */
export const CATEGORY_ICON_OPTIONS = [
  { value: "headphones", label: "Fones de ouvido" },
  { value: "charger", label: "Carregador" },
  { value: "cable", label: "Cabo" },
  { value: "powerbank", label: "Power bank" },
  { value: "speaker", label: "Caixa de som" },
  { value: "smartwatch", label: "Smartwatch" },
  { value: "stand", label: "Suporte" },
  { value: "adapter", label: "Adaptador" },
  { value: "camera", label: "Câmera" },
  { value: "generic", label: "Genérico" },
] as const;

export type CategoryIconKey = (typeof CATEGORY_ICON_OPTIONS)[number]["value"];

export function isCategoryIconKey(value: string | null | undefined): value is CategoryIconKey {
  return CATEGORY_ICON_OPTIONS.some((option) => option.value === value);
}
