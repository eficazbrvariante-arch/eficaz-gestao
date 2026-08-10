"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createUserSchema,
  resetUserPasswordSchema,
  ROLE_OPTIONS,
  type CreateUserFormValues,
  type CreateUserInput,
  type ResetUserPasswordInput,
} from "@/lib/validations/user";
import {
  createUserAction,
  changeUserRoleAction,
  toggleUserActiveAction,
  resetUserPasswordAction,
} from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";
import type { UserRole } from "@/generated/prisma/enums";

type Feedback = { type: "success" | "error"; message: string } | undefined;

export function CreateUserForm({ atLimit }: { atLimit: boolean }) {
  const [feedback, setFeedback] = useState<Feedback>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateUserFormValues, unknown, CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: "SELLER" },
  });

  const onSubmit = (data: CreateUserInput) => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await createUserAction(data);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({ type: "success", message: result?.success ?? "Criado." });
        reset({ role: "SELLER" });
      }
    });
  };

  if (atLimit) {
    return (
      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
        Você atingiu o limite de usuários do seu plano. Mude de plano para adicionar mais
        pessoas à equipe.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="mb-4">
        <Label htmlFor="name">Nome completo</Label>
        <Input id="name" {...register("name")} />
        <FieldError message={errors.name?.message} />
      </div>

      <div className="mb-4">
        <Label htmlFor="email">E-mail (opcional)</Label>
        <Input id="email" type="email" {...register("email")} />
        <p className="mt-1 text-xs text-slate-400">
          Não é preciso pra essa pessoa conseguir entrar — só é usado se ela quiser
          recuperar a própria senha sozinha depois.
        </p>
        <FieldError message={errors.email?.message} />
      </div>

      <div className="mb-4">
        <Label htmlFor="role">Papel</Label>
        <Select id="role" {...register("role")}>
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <ul className="mt-2 space-y-0.5 text-xs text-slate-400">
          {ROLE_OPTIONS.map((option) => (
            <li key={option.value}>
              <span className="font-medium text-slate-500">{option.label}:</span> {option.hint}
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-4">
        <Label htmlFor="password">Senha provisória</Label>
        <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
        <FieldError message={errors.password?.message} />
      </div>

      <div className="mb-6">
        <Label htmlFor="confirmPassword">Confirmar senha</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          {...register("confirmPassword")}
        />
        <FieldError message={errors.confirmPassword?.message} />
      </div>

      <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
        {isPending ? "Criando..." : "Criar usuário"}
      </Button>
      <p className="mt-2 text-xs text-slate-400">
        Combine a senha provisória com a pessoa. Ela pode trocá-la depois em
        &quot;Esqueci minha senha&quot;.
      </p>
    </form>
  );
}

export function UserRowActions({
  userId,
  userName,
  role,
  active,
  isSelf,
}: {
  userId: string;
  userName: string;
  role: UserRole;
  active: boolean;
  isSelf: boolean;
}) {
  const [feedback, setFeedback] = useState<Feedback>();
  const [showReset, setShowReset] = useState(false);
  const [isPending, startTransition] = useTransition();

  function changeRole(next: string) {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await changeUserRoleAction({ userId, role: next as UserRole });
      if (result?.error) setFeedback({ type: "error", message: result.error });
    });
  }

  function toggleActive() {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await toggleUserActiveAction(userId);
      if (result?.error) setFeedback({ type: "error", message: result.error });
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select
          value={role}
          disabled={isPending}
          onChange={(e) => changeRole(e.target.value)}
          className="w-auto py-1 text-xs"
          aria-label={`Papel de ${userName}`}
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <button
          type="button"
          onClick={() => setShowReset((v) => !v)}
          className="text-xs text-slate-600 hover:underline"
        >
          Redefinir senha
        </button>

        {!isSelf && (
          <button
            type="button"
            onClick={toggleActive}
            disabled={isPending}
            className={
              active
                ? "text-xs text-red-600 hover:underline"
                : "text-xs text-emerald-700 hover:underline"
            }
          >
            {active ? "Desativar" : "Reativar"}
          </button>
        )}
      </div>

      {feedback && (
        <p className="text-right text-xs text-red-600">{feedback.message}</p>
      )}

      {showReset && (
        <ResetPasswordForm
          userId={userId}
          userName={userName}
          onDone={() => setShowReset(false)}
        />
      )}
    </div>
  );
}

function ResetPasswordForm({
  userId,
  userName,
  onDone,
}: {
  userId: string;
  userName: string;
  onDone: () => void;
}) {
  const [feedback, setFeedback] = useState<Feedback>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetUserPasswordInput>({
    resolver: zodResolver(resetUserPasswordSchema),
    defaultValues: { userId },
  });

  const onSubmit = (data: ResetUserPasswordInput) => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await resetUserPasswordAction(data);
      if (result?.error) setFeedback({ type: "error", message: result.error });
      else onDone();
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="rounded-md border border-slate-200 bg-slate-50 p-3 text-left"
    >
      <p className="mb-2 text-xs text-slate-600">Nova senha para {userName}:</p>
      <FormBanner message={feedback?.message} variant={feedback?.type} />
      <input type="hidden" {...register("userId")} />

      <div className="mb-2">
        <Input type="password" placeholder="Nova senha" {...register("password")} />
        <FieldError message={errors.password?.message} />
      </div>
      <div className="mb-3">
        <Input type="password" placeholder="Confirmar" {...register("confirmPassword")} />
        <FieldError message={errors.confirmPassword?.message} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending} fullWidth={false} className="px-4 py-1 text-xs">
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-slate-300 bg-white px-4 py-1 text-xs text-slate-700"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
