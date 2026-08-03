import { z } from "zod";

export const REPAIR_ORDER_STATUSES = [
  "RECEIVED",
  "ANALYZING",
  "AWAITING_APPROVAL",
  "APPROVED",
  "IN_REPAIR",
  "AWAITING_PART",
  "READY",
  "DELIVERED",
  "CANCELLED",
] as const;

export type RepairOrderStatusValue = (typeof REPAIR_ORDER_STATUSES)[number];

export const REPAIR_ORDER_STATUS_LABELS: Record<RepairOrderStatusValue, string> = {
  RECEIVED: "Recebido",
  ANALYZING: "Em análise",
  AWAITING_APPROVAL: "Aguardando aprovação",
  APPROVED: "Aprovado",
  IN_REPAIR: "Em manutenção",
  AWAITING_PART: "Aguardando peça",
  READY: "Pronto para retirada",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
};

/** Cor da pílula de status — mesma paleta de "sucesso/atenção/problema" usada em Vendas. */
export const REPAIR_ORDER_STATUS_BADGE_CLASSES: Record<RepairOrderStatusValue, string> = {
  RECEIVED: "bg-slate-100 text-slate-700",
  ANALYZING: "bg-amber-50 text-amber-700",
  AWAITING_APPROVAL: "bg-amber-50 text-amber-700",
  APPROVED: "bg-blue-50 text-blue-700",
  IN_REPAIR: "bg-blue-50 text-blue-700",
  AWAITING_PART: "bg-orange-50 text-orange-700",
  READY: "bg-emerald-50 text-emerald-700",
  DELIVERED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

export const repairOrderItemSchema = z.object({
  description: z.string().trim().min(1, "Descreva o serviço"),
  unitPrice: z.coerce.number().min(0, "Informe o valor do serviço"),
  quantity: z.coerce.number().int().positive("Quantidade deve ser maior que zero"),
});
export type RepairOrderItemInput = z.infer<typeof repairOrderItemSchema>;

export const repairOrderSchema = z.object({
  customerId: z.string().trim().min(1, "Selecione ou cadastre um cliente"),
  brand: z.string().trim().min(1, "Informe a marca"),
  model: z.string().trim().min(1, "Informe o modelo"),
  color: z.string().trim().optional().or(z.literal("")),
  imei: z.string().trim().optional().or(z.literal("")),
  passcode: z.string().trim().optional().or(z.literal("")),
  turnsOn: z.boolean(),
  condition: z.string().trim().optional().or(z.literal("")),
  reportedDefects: z.string().trim().optional().or(z.literal("")),
  internalNotes: z.string().trim().optional().or(z.literal("")),
  /** Data prevista de entrega, formato `YYYY-MM-DD`. */
  estimatedAt: z.string().trim().optional().or(z.literal("")),
  discount: z.coerce.number().min(0, "O desconto não pode ser negativo"),
  items: z.array(repairOrderItemSchema),
  photoUrls: z.array(z.string()),
});
export type RepairOrderInput = z.infer<typeof repairOrderSchema>;

export const updateRepairOrderStatusSchema = z.object({
  status: z.enum(REPAIR_ORDER_STATUSES),
});
export type UpdateRepairOrderStatusInput = z.infer<typeof updateRepairOrderStatusSchema>;
