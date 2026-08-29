/**
 * A comissão (faixa progressiva e exceção por produto) só passou a valer a
 * partir desta data — pedido explícito do usuário pra não retroagir: venda
 * anterior a isso nunca gera comissão, mesmo que o período pedido comece
 * antes. Não existe "história" de comissão/ranking/faixa anterior a este
 * dia. Módulo próprio (sem depender de `commission-service.ts` nem
 * `commission-tier-service.ts`) porque os dois precisam dela e um importar
 * do outro criaria dependência circular.
 */
export const COMMISSION_POLICY_EFFECTIVE_AT_ISO = "2026-08-21";
export const COMMISSION_POLICY_EFFECTIVE_AT = new Date(`${COMMISSION_POLICY_EFFECTIVE_AT_ISO}T00:00:00-03:00`);
