import { z } from "zod";

/** Mantém apenas os dígitos (telefone, CEP, CPF/CNPJ). */
export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export const orderItemSchema = z.object({
  productId: z.string().trim().min(1),
  variantId: z.string().trim().optional().or(z.literal("")),
  quantity: z.coerce.number().int().positive(),
});

/**
 * Campos preenchidos pelo cliente no formulário de checkout.
 * Os itens **não** entram aqui: eles vivem no carrinho (localStorage) e são
 * anexados na hora do envio. Validar `items` junto com o formulário faria a
 * validação falhar num campo invisível, bloqueando o envio sem mostrar erro.
 */
const checkoutFields = {
  customerName: z.string().trim().min(3, "Informe seu nome completo"),
  customerPhone: z
    .string()
    .trim()
    .refine((v) => onlyDigits(v).length >= 10, "Informe um telefone válido com DDD"),
  customerEmail: z
    .string()
    .trim()
    .email("Informe um e-mail válido")
    .optional()
    .or(z.literal("")),
  customerDocument: z.string().trim().optional().or(z.literal("")),

  fulfillment: z.enum(["DELIVERY", "PICKUP"]),
  deliveryZoneId: z.string().trim().optional().or(z.literal("")),
  addressStreet: z.string().trim().optional().or(z.literal("")),
  addressNumber: z.string().trim().optional().or(z.literal("")),
  addressComplement: z.string().trim().optional().or(z.literal("")),
  addressNeighborhood: z.string().trim().optional().or(z.literal("")),
  addressCity: z.string().trim().optional().or(z.literal("")),
  addressState: z.string().trim().max(2, "Use a sigla do estado").optional().or(z.literal("")),
  addressZip: z.string().trim().optional().or(z.literal("")),

  paymentMethod: z.enum(["CASH", "PIX", "DEBIT", "CREDIT", "TO_ARRANGE"]),
  changeFor: z
    .union([z.coerce.number().min(0), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),

  notes: z.string().trim().max(500, "Máximo de 500 caracteres").optional().or(z.literal("")),
};

type AddressField = "addressStreet" | "addressNumber" | "addressNeighborhood";

/** Entrega exige endereço; retirada não. */
function requiredWhenDelivery(field: AddressField) {
  return (data: {
    fulfillment: "DELIVERY" | "PICKUP";
    addressStreet?: string;
    addressNumber?: string;
    addressNeighborhood?: string;
  }) => data.fulfillment !== "DELIVERY" || Boolean(data[field]?.trim());
}

/** Schema do formulário — sem itens, para o React Hook Form validar só o que está na tela. */
export const checkoutFormSchema = z
  .object(checkoutFields)
  .refine(requiredWhenDelivery("addressStreet"), {
    message: "Informe o endereço de entrega",
    path: ["addressStreet"],
  })
  .refine(requiredWhenDelivery("addressNumber"), {
    message: "Informe o número",
    path: ["addressNumber"],
  })
  .refine(requiredWhenDelivery("addressNeighborhood"), {
    message: "Informe o bairro",
    path: ["addressNeighborhood"],
  });

/** Schema completo, validado no servidor — inclui os itens do carrinho. */
export const checkoutSchema = z
  .object({
    ...checkoutFields,
    items: z.array(orderItemSchema).min(1, "Seu carrinho está vazio"),
  })
  .refine(requiredWhenDelivery("addressStreet"), {
    message: "Informe o endereço de entrega",
    path: ["addressStreet"],
  })
  .refine(requiredWhenDelivery("addressNumber"), {
    message: "Informe o número",
    path: ["addressNumber"],
  })
  .refine(requiredWhenDelivery("addressNeighborhood"), {
    message: "Informe o bairro",
    path: ["addressNeighborhood"],
  });

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CheckoutFieldsInput = z.infer<typeof checkoutFormSchema>;
export type CheckoutFormValues = z.input<typeof checkoutFormSchema>;

export const orderStatusSchema = z.object({
  status: z.enum(["NEW", "CONFIRMED", "PREPARING", "SHIPPED", "COMPLETED", "CANCELLED"]),
  reason: z.string().trim().optional().or(z.literal("")),
});
export type OrderStatusInput = z.infer<typeof orderStatusSchema>;

export const deliveryZoneSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da faixa"),
  neighborhood: z.string().trim().optional().or(z.literal("")),
  zipStart: z.string().trim().optional().or(z.literal("")),
  zipEnd: z.string().trim().optional().or(z.literal("")),
  fee: z.coerce.number().min(0, "A taxa não pode ser negativa"),
  estimate: z.string().trim().optional().or(z.literal("")),
  active: z.boolean().default(true),
});
export type DeliveryZoneInput = z.infer<typeof deliveryZoneSchema>;
export type DeliveryZoneFormValues = z.input<typeof deliveryZoneSchema>;

export const deliverySettingsSchema = z.object({
  deliveryEnabled: z.boolean().default(true),
  pickupEnabled: z.boolean().default(true),
  stockPolicy: z.enum(["RESERVE", "DEDUCT"]),
  pickupNotes: z.string().trim().max(300).optional().or(z.literal("")),
});
export type DeliverySettingsInput = z.infer<typeof deliverySettingsSchema>;
export type DeliverySettingsFormValues = z.input<typeof deliverySettingsSchema>;
