import { z } from "zod";
import { checkoutAuthSchema } from "@/lib/validations/customer-auth";

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
  // Obrigatórios só ao criar conta nova (aba "Criar conta") — quem já tem
  // conta ("Já tenho conta"/sessão ativa) não vê esses campos, os dados vêm
  // do `Customer` já cadastrado. Ver `requiredWhenRegistering` abaixo.
  customerName: z.string().trim().optional().or(z.literal("")),
  customerPhone: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || onlyDigits(v).length >= 10, "Informe um telefone válido com DDD"),
  customerEmail: z
    .string()
    .trim()
    .email("Informe um e-mail válido")
    .optional()
    .or(z.literal("")),
  customerDocument: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || onlyDigits(v).length === 11, "CPF deve ter 11 dígitos"),
  /** `YYYY-MM-DD`, mesmo formato do `<input type="date">` do formulário. */
  customerBirthDate: z.string().trim().optional().or(z.literal("")),

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

/**
 * Formato "leve" de `auth` só para o formulário no navegador — não é o
 * `checkoutAuthSchema` estrito (discriminated union) que valida de verdade no
 * servidor. Existe separado porque React Hook Form não lida bem com um campo
 * cujo tipo é uma union discriminada (o `register("auth.username")` não
 * tipa). Campos extras que não fazem sentido pro modo atual (ex.: `username`
 * quando `authMode: "session"`) são simplesmente ignorados pelo
 * `checkoutAuthSchema` no servidor — cada branch da union só lê o que é dela.
 */
const clientAuthSchema = z.object({
  authMode: z.enum(["register", "login", "session"]),
  username: z.string().trim().optional().or(z.literal("")),
  password: z.string().optional().or(z.literal("")),
});

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

type RegisterField = "customerName" | "customerPhone" | "customerDocument" | "customerBirthDate";

/** Nome/telefone/CPF/data de nascimento só são pedidos (e exigidos) quando o cliente está criando conta nova. */
function requiredWhenRegistering(field: RegisterField) {
  return (data: {
    auth: { authMode: string };
    customerName?: string;
    customerPhone?: string;
    customerDocument?: string;
    customerBirthDate?: string;
  }) => data.auth.authMode !== "register" || Boolean(data[field]?.trim());
}

/** authMode/username/senha exigidos só fora do modo "session" (conta já logada). */
function requiredWhenNotSession(field: "username" | "password") {
  return (data: { auth: { authMode: string; username?: string; password?: string } }) =>
    data.auth.authMode === "session" || Boolean(data.auth[field]?.trim());
}

/** Schema do formulário — sem itens, para o React Hook Form validar só o que está na tela. */
export const checkoutFormSchema = z
  .object({ ...checkoutFields, auth: clientAuthSchema })
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
  })
  .refine(requiredWhenRegistering("customerName"), {
    message: "Informe seu nome completo",
    path: ["customerName"],
  })
  .refine(requiredWhenRegistering("customerPhone"), {
    message: "Informe um telefone válido com DDD",
    path: ["customerPhone"],
  })
  .refine(requiredWhenRegistering("customerDocument"), {
    message: "Informe o CPF",
    path: ["customerDocument"],
  })
  .refine(requiredWhenRegistering("customerBirthDate"), {
    message: "Informe a data de nascimento",
    path: ["customerBirthDate"],
  })
  .refine(requiredWhenNotSession("username"), {
    message: "Campo obrigatório",
    path: ["auth", "username"],
  })
  .refine(requiredWhenNotSession("password"), {
    message: "Informe uma senha",
    path: ["auth", "password"],
  })
  .refine((data) => data.auth.authMode !== "register" || (data.auth.password?.length ?? 0) >= 8, {
    message: "Mínimo de 8 caracteres",
    path: ["auth", "password"],
  });

/** Schema completo, validado no servidor — inclui os itens do carrinho e o `auth` estrito (discriminated union). */
export const checkoutSchema = z
  .object({
    ...checkoutFields,
    items: z.array(orderItemSchema).min(1, "Seu carrinho está vazio"),
    auth: checkoutAuthSchema,
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
  })
  .refine(requiredWhenRegistering("customerName"), {
    message: "Informe seu nome completo",
    path: ["customerName"],
  })
  .refine(requiredWhenRegistering("customerPhone"), {
    message: "Informe um telefone válido com DDD",
    path: ["customerPhone"],
  })
  .refine(requiredWhenRegistering("customerDocument"), {
    message: "Informe o CPF",
    path: ["customerDocument"],
  })
  .refine(requiredWhenRegistering("customerBirthDate"), {
    message: "Informe a data de nascimento",
    path: ["customerBirthDate"],
  });

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CheckoutFieldsInput = z.infer<typeof checkoutFormSchema>;
export type CheckoutFormValues = z.input<typeof checkoutFormSchema>;
/** O que o formulário de fato envia para `submitOrderAction` — `auth` no formato leve do cliente (ver `clientAuthSchema`), validado de verdade no servidor por `checkoutSchema`. */
export type CheckoutSubmission = CheckoutFieldsInput & {
  items: { productId: string; variantId?: string; quantity: number }[];
};

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
  freeShippingMin: z
    .union([z.coerce.number().min(0, "O valor não pode ser negativo"), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
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
