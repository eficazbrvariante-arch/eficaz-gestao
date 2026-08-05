"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { selectUserLoginSchema, type SelectUserLoginInput } from "@/lib/validations/auth";
import { loginWithSelectedUserAction } from "../actions";
import { ROLE_LABELS } from "@/lib/permissions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";
import type { UserRole } from "@/generated/prisma/enums";

type PickableUser = { id: string; name: string; role: UserRole };

export function UserPickerLoginForm({
  users,
  callbackUrl,
}: {
  users: PickableUser[];
  callbackUrl?: string;
}) {
  const [selected, setSelected] = useState<PickableUser | null>(null);
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SelectUserLoginInput>({
    resolver: zodResolver(selectUserLoginSchema),
  });

  const onSubmit = (data: SelectUserLoginInput) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = await loginWithSelectedUserAction(data, callbackUrl);
      if (result?.error) setServerError(result.error);
    });
  };

  if (!selected) {
    return (
      <div>
        <p className="mb-3 text-sm font-medium text-slate-700">Quem é você?</p>
        {users.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhum colaborador ativo encontrado para este dispositivo.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => setSelected(user)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">{user.name}</span>
                <span className="text-xs text-slate-400">{ROLE_LABELS[user.role]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="mb-4 flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
        <span className="text-sm font-medium text-slate-900">{selected.name}</span>
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="text-xs text-slate-500 hover:underline"
        >
          Trocar
        </button>
      </div>

      <FormBanner message={serverError} variant="error" />

      <input type="hidden" value={selected.id} {...register("userId")} />

      <div className="mb-6">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          {...register("password")}
        />
        <FieldError message={errors.password?.message} />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
