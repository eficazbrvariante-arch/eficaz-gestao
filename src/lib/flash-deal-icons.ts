/**
 * Conjunto fixo de ícones disponíveis para a Oferta Relâmpago, usado pelo
 * seletor no painel (`flash-deal-schedule-form.tsx`) e pelo registro de
 * ícones da loja (`src/app/loja/[subdomain]/icons.tsx`). Compartilhado sem
 * depender de React, mesmo padrão de `category-icons.ts`.
 */
export const FLASH_DEAL_ICON_OPTIONS = [
  { value: "lightning", label: "Raio" },
  { value: "fire", label: "Fogo" },
  { value: "gift", label: "Presente" },
  { value: "clock", label: "Relógio" },
  { value: "bag", label: "Sacola" },
  { value: "target", label: "Alvo" },
] as const;

export type FlashDealIconKey = (typeof FLASH_DEAL_ICON_OPTIONS)[number]["value"];

export function isFlashDealIconKey(value: string | null | undefined): value is FlashDealIconKey {
  return FLASH_DEAL_ICON_OPTIONS.some((option) => option.value === value);
}
