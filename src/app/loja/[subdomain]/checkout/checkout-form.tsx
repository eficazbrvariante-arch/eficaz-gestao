"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  checkoutFormSchema,
  type CheckoutFieldsInput,
  type CheckoutFormValues,
} from "@/lib/validations/order";
import { useCart } from "@/modules/catalog/cart-context";
import { formatBRL } from "@/lib/format";
import { lookupAddressByZip } from "@/lib/viacep";
import { markFlashDealPurchased } from "../flash-deal-popup-storage";
import { trackEvent } from "@/modules/analytics/track-client";
import { submitOrderAction, quoteDeliveryFeeAction, checkUsernameAvailableAction } from "./actions";
import { logoutCustomerAction } from "@/modules/customers/customer-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";

type Quote = {
  fee: number;
  zoneName: string | null;
  estimate: string | null;
  found: boolean;
  free: boolean;
};

const USERNAME_CHECK_DEBOUNCE_MS = 500;

export function CheckoutForm({
  subdomain,
  base,
  deliveryEnabled,
  pickupEnabled,
  pickupNotes,
  loggedIn,
}: {
  subdomain: string;
  base: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  pickupNotes: string | null;
  loggedIn: { name: string; username: string } | null;
}) {
  const router = useRouter();
  const { items, subtotal, ready, clear, flashDealProductId } = useCart();
  const [serverError, setServerError] = useState<string>();
  const [quote, setQuote] = useState<Quote>();
  const [isPending, startTransition] = useTransition();

  // Sem sessão ativa, o cliente escolhe entre criar conta (padrão) ou entrar
  // numa já existente — os dois caminhos vão juntos no mesmo submit do
  // pedido, sem navegar pra outra página (ver `submitOrderAction`).
  const [authTab, setAuthTab] = useState<"register" | "login">("register");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">(
    "idle"
  );
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (ready && items.length > 0) {
      trackEvent(subdomain, { type: "CHECKOUT_START" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subdomain, ready]);

  const [zipStatus, setZipStatus] = useState<"idle" | "loading" | "notFound">("idle");

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    setValue,
    setError,
    formState: { errors },
  } = useForm<CheckoutFormValues, unknown, CheckoutFieldsInput>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: {
      fulfillment: deliveryEnabled ? "DELIVERY" : "PICKUP",
      paymentMethod: "PIX",
      auth: { authMode: loggedIn ? "session" : "register", username: "", password: "" },
    },
  });

  // Mantém `auth.authMode` em sincronia com a aba escolhida (ou com a sessão
  // ativa) — é esse campo, e não o estado local `authTab`, que o zod valida.
  useEffect(() => {
    setValue("auth.authMode", loggedIn ? "session" : authTab);
  }, [authTab, loggedIn, setValue]);

  const fulfillment = watch("fulfillment");
  const paymentMethod = watch("paymentMethod");
  const isDelivery = fulfillment === "DELIVERY";

  // Registrados uma vez para poder compor o `onBlur` do formulário com a
  // consulta da taxa — espalhar `register(...)` depois de `onBlur` o sobrescreveria.
  const neighborhoodField = register("addressNeighborhood");
  const zipField = register("addressZip");
  const usernameField = register("auth.username", {
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
      if (value.trim().length < 3) {
        setUsernameStatus("idle");
        return;
      }
      setUsernameStatus("checking");
      usernameDebounceRef.current = setTimeout(async () => {
        const { available } = await checkUsernameAvailableAction(subdomain, value);
        setUsernameStatus(available ? "available" : "taken");
      }, USERNAME_CHECK_DEBOUNCE_MS);
    },
  });

  const deliveryFee = isDelivery ? (quote?.fee ?? 0) : 0;
  const total = Math.round((subtotal + deliveryFee) * 100) / 100;

  function checkFee() {
    const values = getValues();
    startTransition(async () => {
      setQuote(
        await quoteDeliveryFeeAction(
          subdomain,
          values.addressNeighborhood ?? "",
          values.addressZip ?? "",
          subtotal
        )
      );
    });
  }

  /**
   * Preenche o endereço a partir do CEP e, em seguida, consulta a taxa.
   * Campos já digitados não são sobrescritos, para não apagar o que o cliente ajustou.
   */
  async function fillAddressFromZip() {
    const zip = getValues("addressZip") ?? "";
    if (zip.replace(/\D/g, "").length !== 8) {
      checkFee();
      return;
    }

    setZipStatus("loading");
    const address = await lookupAddressByZip(zip);

    if (!address) {
      setZipStatus("notFound");
      checkFee();
      return;
    }

    setZipStatus("idle");
    const fillIfEmpty = (field: "addressStreet" | "addressNeighborhood" | "addressCity" | "addressState", value: string) => {
      if (value && !getValues(field)?.trim()) {
        setValue(field, value, { shouldValidate: true });
      }
    };
    fillIfEmpty("addressStreet", address.street);
    fillIfEmpty("addressNeighborhood", address.neighborhood);
    fillIfEmpty("addressCity", address.city);
    fillIfEmpty("addressState", address.state);

    checkFee();
  }

  function handleSwitchAccount() {
    startTransition(async () => {
      await logoutCustomerAction(subdomain);
      router.refresh();
    });
  }

  /**
   * Chamado quando o formulário é inválido. Sem isto, um erro em campo que não
   * está na tela faria o botão "não fazer nada" sem explicação.
   */
  const onInvalid = () => {
    setServerError("Revise os campos destacados acima para continuar.");
  };

  const onSubmit = (data: CheckoutFieldsInput) => {
    setServerError(undefined);

    if (items.length === 0) {
      setServerError("Seu carrinho está vazio.");
      return;
    }

    startTransition(async () => {
      const result = await submitOrderAction(subdomain, {
        ...data,
        auth: { ...data.auth, authMode: loggedIn ? "session" : authTab },
        items: items.map((line) => ({
          productId: line.productId,
          variantId: line.variantId ?? "",
          quantity: line.quantity,
        })),
      });

      if ("error" in result && result.error) {
        if (result.field === "auth.username") {
          setError("auth.username", { message: result.error });
        } else if (result.field === "auth.password") {
          setError("auth.password", { message: result.error });
        }
        setServerError(result.error);
        return;
      }
      if ("orderId" in result) {
        const hasFlashItem = items.some((line) => line.productId === flashDealProductId);
        trackEvent(subdomain, {
          type: "PURCHASE",
          orderId: result.orderId,
          ...(hasFlashItem && flashDealProductId ? { productId: flashDealProductId } : {}),
        });
        markFlashDealPurchased(subdomain);
        clear();
        router.push(`${base}/pedido/${result.orderId}?t=${result.publicAccessToken}`);
      }
    });
  };

  if (!ready) {
    return <p className="text-sm text-slate-400">Carregando...</p>;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center">
        <p className="text-slate-600">Seu carrinho está vazio.</p>
        <Link
          href={`${base}/produtos`}
          className="mt-4 inline-block rounded-md px-5 py-2.5 text-sm font-medium text-white"
          style={{ backgroundColor: "var(--store-primary)" }}
        >
          Ver produtos
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Contato / conta */}
          <section className="rounded-xl border border-slate-200 p-5">
            {loggedIn ? (
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm text-slate-700">
                  Comprando como <span className="font-semibold">@{loggedIn.username}</span>
                </p>
                <button
                  type="button"
                  onClick={handleSwitchAccount}
                  disabled={isPending}
                  className="text-sm text-slate-500 hover:underline"
                >
                  Trocar de conta
                </button>
              </div>
            ) : (
              <div className="mb-4 flex gap-2 rounded-md bg-slate-100 p-1 text-sm">
                <button
                  type="button"
                  onClick={() => setAuthTab("register")}
                  className={
                    authTab === "register"
                      ? "flex-1 rounded-md bg-white px-3 py-2 font-medium text-slate-900 shadow-sm"
                      : "flex-1 rounded-md px-3 py-2 text-slate-500"
                  }
                >
                  Criar conta
                </button>
                <button
                  type="button"
                  onClick={() => setAuthTab("login")}
                  className={
                    authTab === "login"
                      ? "flex-1 rounded-md bg-white px-3 py-2 font-medium text-slate-900 shadow-sm"
                      : "flex-1 rounded-md px-3 py-2 text-slate-500"
                  }
                >
                  Já tenho conta
                </button>
              </div>
            )}

            {!loggedIn && authTab === "register" && (
              <>
                <div className="mb-4">
                  <Label htmlFor="customerName">Nome completo *</Label>
                  <Input id="customerName" autoComplete="name" {...register("customerName")} />
                  <FieldError message={errors.customerName?.message} />
                </div>

                <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="customerPhone">Telefone / WhatsApp *</Label>
                    <Input
                      id="customerPhone"
                      autoComplete="tel"
                      placeholder="(11) 99999-9999"
                      {...register("customerPhone")}
                    />
                    <FieldError message={errors.customerPhone?.message} />
                  </div>
                  <div>
                    <Label htmlFor="customerEmail">E-mail</Label>
                    <Input
                      id="customerEmail"
                      type="email"
                      autoComplete="email"
                      {...register("customerEmail")}
                    />
                    <FieldError message={errors.customerEmail?.message} />
                  </div>
                </div>
              </>
            )}

            {!loggedIn && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="authUsername">@usuário *</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
                      @
                    </span>
                    <Input
                      id="authUsername"
                      // "off" no cadastro: com "username" o Safari às vezes
                      // preenche esse campo com o mesmo valor do e-mail
                      // (autofill de conta), sobrescrevendo o @usuário digitado.
                      // No login é "username" mesmo -- ali é uma conta já
                      // existente, o autofill correto ajuda.
                      autoComplete={authTab === "register" ? "off" : "username"}
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="pl-7"
                      {...usernameField}
                    />
                  </div>
                  {authTab === "register" && usernameStatus === "checking" && (
                    <p className="mt-1 text-xs text-slate-500">Verificando disponibilidade...</p>
                  )}
                  {authTab === "register" && usernameStatus === "available" && (
                    <p className="mt-1 text-xs text-emerald-600">Disponível.</p>
                  )}
                  {authTab === "register" && usernameStatus === "taken" && (
                    <p className="mt-1 text-xs text-amber-600">Esse @usuário já está em uso.</p>
                  )}
                  <FieldError message={errors.auth?.username?.message} />
                </div>
                <div>
                  <Label htmlFor="authPassword">Senha *</Label>
                  <Input
                    id="authPassword"
                    type="password"
                    autoComplete={authTab === "register" ? "new-password" : "current-password"}
                    {...register("auth.password")}
                  />
                  {authTab === "register" && (
                    <p className="mt-1 text-xs text-slate-500">Mínimo de 8 caracteres.</p>
                  )}
                  <FieldError message={errors.auth?.password?.message} />
                </div>
              </div>
            )}
          </section>

          {/* Entrega ou retirada */}
          <section className="rounded-xl border border-slate-200 p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Como você quer receber</h2>

            <div className="mb-4 flex flex-wrap gap-3">
              {deliveryEnabled && (
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-4 py-2.5 text-sm has-[:checked]:border-slate-900 has-[:checked]:bg-slate-50">
                  <input type="radio" value="DELIVERY" {...register("fulfillment")} />
                  Entrega no meu endereço
                </label>
              )}
              {pickupEnabled && (
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-4 py-2.5 text-sm has-[:checked]:border-slate-900 has-[:checked]:bg-slate-50">
                  <input type="radio" value="PICKUP" {...register("fulfillment")} />
                  Retirar na loja
                </label>
              )}
            </div>

            {!isDelivery && pickupNotes && (
              <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">{pickupNotes}</p>
            )}

            {isDelivery && (
              <>
                <div className="mb-4 max-w-xs">
                  <Label htmlFor="addressZip">CEP</Label>
                  <Input
                    id="addressZip"
                    inputMode="numeric"
                    placeholder="00000-000"
                    {...zipField}
                    onBlur={(e) => {
                      zipField.onBlur(e);
                      void fillAddressFromZip();
                    }}
                  />
                  {zipStatus === "loading" && (
                    <p className="mt-1 text-xs text-slate-500">Buscando endereço...</p>
                  )}
                  {zipStatus === "notFound" && (
                    <p className="mt-1 text-xs text-amber-600">
                      CEP não encontrado. Preencha o endereço manualmente.
                    </p>
                  )}
                  {zipStatus === "idle" && (
                    <p className="mt-1 text-xs text-slate-400">
                      Digite o CEP para preencher o endereço automaticamente.
                    </p>
                  )}
                </div>

                <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <Label htmlFor="addressStreet">Endereço *</Label>
                    <Input id="addressStreet" {...register("addressStreet")} />
                    <FieldError message={errors.addressStreet?.message} />
                  </div>
                  <div>
                    <Label htmlFor="addressNumber">Número *</Label>
                    <Input id="addressNumber" {...register("addressNumber")} />
                    <FieldError message={errors.addressNumber?.message} />
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="addressComplement">Complemento</Label>
                    <Input
                      id="addressComplement"
                      placeholder="Apto, bloco, referência"
                      {...register("addressComplement")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="addressNeighborhood">Bairro *</Label>
                    <Input
                      id="addressNeighborhood"
                      {...neighborhoodField}
                      onBlur={(e) => {
                        neighborhoodField.onBlur(e);
                        checkFee();
                      }}
                    />
                    <FieldError message={errors.addressNeighborhood?.message} />
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="addressCity">Cidade</Label>
                    <Input id="addressCity" {...register("addressCity")} />
                  </div>
                  <div>
                    <Label htmlFor="addressState">Estado</Label>
                    <Input id="addressState" maxLength={2} {...register("addressState")} />
                    <FieldError message={errors.addressState?.message} />
                  </div>
                </div>

                {quote && (
                  <p
                    className={
                      quote.found
                        ? "rounded-md bg-emerald-50 p-3 text-sm text-emerald-800"
                        : "rounded-md bg-amber-50 p-3 text-sm text-amber-800"
                    }
                  >
                    {quote.found
                      ? quote.free
                        ? `Entrega grátis em ${quote.zoneName}!${quote.estimate ? ` · ${quote.estimate}` : ""}`
                        : `Entrega em ${quote.zoneName}: ${formatBRL(quote.fee)}${quote.estimate ? ` · ${quote.estimate}` : ""}`
                      : "Não encontramos uma taxa cadastrada para esta região. A loja vai combinar o valor da entrega com você."}
                  </p>
                )}
              </>
            )}
          </section>

          {/* Pagamento */}
          <section className="rounded-xl border border-slate-200 p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Pagamento</h2>
            <p className="mb-3 text-xs text-slate-500">
              O pagamento é combinado diretamente com a loja — nada é cobrado agora.
            </p>

            <div className="mb-4">
              <Label htmlFor="paymentMethod">Forma de pagamento</Label>
              <Select id="paymentMethod" {...register("paymentMethod")}>
                <option value="PIX">PIX</option>
                <option value="CASH">Dinheiro</option>
                <option value="DEBIT">Cartão de débito</option>
                <option value="CREDIT">Cartão de crédito</option>
                <option value="TO_ARRANGE">A combinar</option>
              </Select>
            </div>

            {paymentMethod === "CASH" && (
              <div className="mb-4">
                <Label htmlFor="changeFor">Precisa de troco para quanto? (R$)</Label>
                <Input
                  id="changeFor"
                  type="number"
                  step="0.01"
                  placeholder="Deixe vazio se não precisar"
                  {...register("changeFor")}
                />
              </div>
            )}

            <div>
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                rows={3}
                placeholder="Alguma informação para a loja?"
                {...register("notes")}
              />
              <FieldError message={errors.notes?.message} />
            </div>
          </section>
        </div>

        {/* Resumo */}
        <aside className="lg:col-span-1">
          <div className="rounded-xl border border-slate-200 p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Resumo do pedido</h2>

            <ul className="mb-4 space-y-2 text-sm">
              {items.map((line) => (
                <li key={line.key} className="flex justify-between gap-2 text-slate-600">
                  <span className="min-w-0">
                    {line.quantity}x {line.name}
                    {line.variantName && (
                      <span className="block text-xs text-slate-400">{line.variantName}</span>
                    )}
                  </span>
                  <span className="shrink-0">{formatBRL(line.unitPrice * line.quantity)}</span>
                </li>
              ))}
            </ul>

            <div className="space-y-1 border-t border-slate-200 pt-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{formatBRL(subtotal)}</span>
              </div>
              {isDelivery && (
                <div className="flex justify-between text-slate-600">
                  <span>Entrega</span>
                  <span>{quote?.found ? formatBRL(deliveryFee) : "a combinar"}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-semibold text-slate-900">
                <span>Total</span>
                <span>{formatBRL(total)}</span>
              </div>
            </div>

            <FormBanner message={serverError} variant="error" />

            <button
              type="submit"
              disabled={isPending}
              className="mt-4 w-full rounded-md px-5 py-3 text-sm font-medium text-white disabled:bg-slate-400"
              style={
                isPending ? undefined : { backgroundColor: "var(--store-primary)" }
              }
            >
              {isPending ? "Enviando pedido..." : "Finalizar pedido"}
            </button>

            <Link
              href={`${base}/carrinho`}
              className="mt-3 block text-center text-sm text-slate-500 hover:underline"
            >
              Voltar ao carrinho
            </Link>
          </div>
        </aside>
      </div>
    </form>
  );
}
