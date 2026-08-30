/**
 * Camada desacoplada de cobrança — preparação de arquitetura pedida pro
 * Protótipo 1, pra uma futura integração de Pix/boleto não exigir
 * reescrever o Crédito Eficaz. Nada aqui é chamado por nenhum fluxo real
 * ainda: nenhum provedor de verdade, nenhum boleto/QR Code inventado,
 * nenhum endpoint de webhook. Só a interface e uma implementação manual
 * (no-op) que documenta o formato esperado.
 */

export type BillingChargeRequest = {
  tenantId: string;
  usageId: string;
  amount: number;
  dueDate: Date;
};

export type BillingChargeResult = {
  provider: string;
  externalId: string | null;
  method: string | null;
};

/**
 * Contrato que um futuro provedor financeiro (Pix/boleto registrado)
 * precisará implementar. `createCharge` emitiria a cobrança externa;
 * `checkStatus` consultaria/conciliaria. Nenhum dos dois é chamado hoje.
 */
export interface BillingProvider {
  createCharge(request: BillingChargeRequest): Promise<BillingChargeResult>;
  checkStatus(externalId: string): Promise<"PENDING" | "PAID" | "CANCELLED">;
}

/**
 * Implementação manual (Protótipo 1): não emite nada externo, só existe
 * pra validar a interface e servir de referência de assinatura pra um
 * provedor real entrar depois sem mudar o resto do módulo.
 */
export class ManualBillingProvider implements BillingProvider {
  async createCharge(): Promise<BillingChargeResult> {
    return { provider: "MANUAL", externalId: null, method: null };
  }

  async checkStatus(): Promise<"PENDING" | "PAID" | "CANCELLED"> {
    return "PENDING";
  }
}
