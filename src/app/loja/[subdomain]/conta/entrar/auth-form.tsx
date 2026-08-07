"use client";

import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  loginSchema,
  registerCustomerSchema,
  type LoginInput,
  type RegisterCustomerInput,
} from "@/lib/validations/customer-auth";
import { loginCustomerAction, registerCustomerAction } from "./actions";
import { checkUsernameAvailableAction } from "../../checkout/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";

const USERNAME_CHECK_DEBOUNCE_MS = 500;

function LoginPanel({ subdomain, returnTo }: { subdomain: string; returnTo: string | null }) {
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = (data: LoginInput) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = await loginCustomerAction(subdomain, data, returnTo);
      if (result?.error) setServerError(result.error);
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div>
        <Label htmlFor="username">@usuário</Label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
            @
          </span>
          <Input id="username" className="pl-7" autoComplete="username" {...register("username")} />
        </div>
        <FieldError message={errors.username?.message} />
      </div>
      <div>
        <Label htmlFor="password">Senha</Label>
        <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
        <FieldError message={errors.password?.message} />
      </div>

      <FormBanner message={serverError} variant="error" />

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md px-5 py-3 text-sm font-medium text-white disabled:bg-slate-400"
        style={isPending ? undefined : { backgroundColor: "var(--store-primary)" }}
      >
        {isPending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}

function RegisterPanel({ subdomain, returnTo }: { subdomain: string; returnTo: string | null }) {
  const [serverError, setServerError] = useState<string>();
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">(
    "idle"
  );
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterCustomerInput>({ resolver: zodResolver(registerCustomerSchema) });

  // Checagem de disponibilidade só faz sentido aqui (cadastro de @usuário
  // novo) -- nunca no painel de login, onde revelar "esse usuário existe"
  // ajudaria a enumerar contas (ver `authenticateCustomer`). `onChange` vai
  // direto no elemento (não nas opções de `register`) para o ref do debounce
  // nunca ser lido dentro de uma closure passada pro `register` -- só em
  // handler de evento nativo, que é onde o React Compiler aceita.
  const usernameField = register("username");

  const onSubmit = (data: RegisterCustomerInput) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = await registerCustomerAction(subdomain, data, returnTo);
      if (result?.error) {
        if (result.field === "username") setError("username", { message: result.error });
        setServerError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div>
        <Label htmlFor="name">Nome completo</Label>
        <Input id="name" autoComplete="name" {...register("name")} />
        <FieldError message={errors.name?.message} />
      </div>
      <div>
        <Label htmlFor="phone">Telefone / WhatsApp</Label>
        <Input id="phone" autoComplete="tel" placeholder="(11) 99999-9999" {...register("phone")} />
        <FieldError message={errors.phone?.message} />
      </div>
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
        <FieldError message={errors.email?.message} />
      </div>
      <div>
        <Label htmlFor="username">@usuário</Label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
            @
          </span>
          <Input
            id="username"
            className="pl-7"
            autoComplete="username"
            {...usernameField}
            onChange={(e) => {
              usernameField.onChange(e);
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
            }}
          />
        </div>
        {usernameStatus === "checking" && (
          <p className="mt-1 text-xs text-slate-500">Verificando disponibilidade...</p>
        )}
        {usernameStatus === "available" && <p className="mt-1 text-xs text-emerald-600">Disponível.</p>}
        {usernameStatus === "taken" && (
          <p className="mt-1 text-xs text-amber-600">Esse @usuário já está em uso.</p>
        )}
        <FieldError message={errors.username?.message} />
      </div>
      <div>
        <Label htmlFor="password">Senha</Label>
        <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
        <p className="mt-1 text-xs text-slate-500">Mínimo de 8 caracteres.</p>
        <FieldError message={errors.password?.message} />
      </div>

      <FormBanner message={serverError} variant="error" />

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md px-5 py-3 text-sm font-medium text-white disabled:bg-slate-400"
        style={isPending ? undefined : { backgroundColor: "var(--store-primary)" }}
      >
        {isPending ? "Criando conta..." : "Criar conta"}
      </button>
    </form>
  );
}

export function AuthForm({
  subdomain,
  returnTo,
  defaultTab,
}: {
  subdomain: string;
  returnTo: string | null;
  defaultTab: "login" | "register";
}) {
  const [tab, setTab] = useState(defaultTab);

  return (
    <div>
      <div className="mb-6 flex gap-2 rounded-md bg-slate-100 p-1 text-sm">
        <button
          type="button"
          onClick={() => setTab("login")}
          className={
            tab === "login"
              ? "flex-1 rounded-md bg-white px-3 py-2 font-medium text-slate-900 shadow-sm"
              : "flex-1 rounded-md px-3 py-2 text-slate-500"
          }
        >
          Entrar
        </button>
        <button
          type="button"
          onClick={() => setTab("register")}
          className={
            tab === "register"
              ? "flex-1 rounded-md bg-white px-3 py-2 font-medium text-slate-900 shadow-sm"
              : "flex-1 rounded-md px-3 py-2 text-slate-500"
          }
        >
          Cadastrar
        </button>
      </div>

      {tab === "login" ? (
        <LoginPanel subdomain={subdomain} returnTo={returnTo} />
      ) : (
        <RegisterPanel subdomain={subdomain} returnTo={returnTo} />
      )}
    </div>
  );
}
