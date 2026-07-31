"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageSettings } from "@/lib/permissions";
import { checkLimit } from "@/lib/plans";
import { recordAudit } from "@/modules/audit/audit-service";
import {
  createUserSchema,
  changeRoleSchema,
  resetUserPasswordSchema,
  type CreateUserInput,
  type ChangeRoleInput,
  type ResetUserPasswordInput,
} from "@/lib/validations/user";

/**
 * Uma empresa nunca pode ficar sem administrador ativo — senão ninguém
 * conseguiria mais gerenciar usuários nem configurações.
 */
async function countOtherActiveAdmins(tenantId: string, exceptUserId: string) {
  return prisma.user.count({
    where: { tenantId, role: "ADMIN", active: true, NOT: { id: exceptUserId } },
  });
}

export async function createUserAction(input: CreateUserInput) {
  const actor = await requireUser();
  if (!canManageSettings(actor.role)) {
    return { error: "Seu perfil não tem permissão para gerenciar usuários." };
  }

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { error: "Já existe uma conta com este e-mail." };

  const [tenant, userCount] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: actor.tenantId },
      select: { plan: true },
    }),
    prisma.user.count({ where: { tenantId: actor.tenantId } }),
  ]);

  const limit = checkLimit(tenant.plan, "users", userCount);
  if (!limit.allowed) return { error: limit.error };

  const created = await prisma.user.create({
    data: {
      tenantId: actor.tenantId,
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
    },
    select: { id: true, name: true, role: true },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    userName: actor.name ?? actor.email ?? "Usuário",
    action: "user.create",
    entity: "User",
    entityId: created.id,
    description: `Criou o usuário ${created.name} com o papel ${created.role}.`,
  });

  revalidatePath("/usuarios");
  return { success: `Usuário ${created.name} criado.` };
}

export async function changeUserRoleAction(input: ChangeRoleInput) {
  const actor = await requireUser();
  if (!canManageSettings(actor.role)) {
    return { error: "Seu perfil não tem permissão para gerenciar usuários." };
  }

  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  const target = await prisma.user.findFirst({
    where: { id: parsed.data.userId, tenantId: actor.tenantId },
  });
  if (!target) return { error: "Usuário não encontrado." };
  if (target.role === parsed.data.role) return { success: "Nada a alterar." };

  // Rebaixar o último administrador deixaria a empresa sem quem administra.
  if (target.role === "ADMIN" && parsed.data.role !== "ADMIN") {
    const others = await countOtherActiveAdmins(actor.tenantId, target.id);
    if (others === 0) {
      return {
        error: "Este é o único administrador ativo. Promova outra pessoa antes de alterar o papel.",
      };
    }
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { role: parsed.data.role },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    userName: actor.name ?? actor.email ?? "Usuário",
    action: "user.role_change",
    entity: "User",
    entityId: target.id,
    description: `Alterou o papel de ${target.name} de ${target.role} para ${parsed.data.role}.`,
  });

  revalidatePath("/usuarios");
  return { success: `Papel de ${target.name} atualizado.` };
}

export async function toggleUserActiveAction(userId: string) {
  const actor = await requireUser();
  if (!canManageSettings(actor.role)) {
    return { error: "Seu perfil não tem permissão para gerenciar usuários." };
  }

  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId: actor.tenantId },
  });
  if (!target) return { error: "Usuário não encontrado." };

  if (target.id === actor.id) {
    return { error: "Você não pode desativar a própria conta." };
  }

  if (target.active && target.role === "ADMIN") {
    const others = await countOtherActiveAdmins(actor.tenantId, target.id);
    if (others === 0) {
      return { error: "Este é o único administrador ativo e não pode ser desativado." };
    }
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { active: !target.active },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    userName: actor.name ?? actor.email ?? "Usuário",
    action: target.active ? "user.deactivate" : "user.activate",
    entity: "User",
    entityId: target.id,
    description: `${target.active ? "Desativou" : "Reativou"} o usuário ${target.name}.`,
  });

  revalidatePath("/usuarios");
  return {
    success: `${target.name} ${target.active ? "desativado" : "reativado"}.`,
  };
}

export async function resetUserPasswordAction(input: ResetUserPasswordInput) {
  const actor = await requireUser();
  if (!canManageSettings(actor.role)) {
    return { error: "Seu perfil não tem permissão para gerenciar usuários." };
  }

  const parsed = resetUserPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const target = await prisma.user.findFirst({
    where: { id: parsed.data.userId, tenantId: actor.tenantId },
  });
  if (!target) return { error: "Usuário não encontrado." };

  await prisma.user.update({
    where: { id: target.id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      // Um link de recuperação pendente deixa de valer.
      resetToken: null,
      resetTokenExpiresAt: null,
    },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    userName: actor.name ?? actor.email ?? "Usuário",
    action: "user.password_reset",
    entity: "User",
    entityId: target.id,
    description: `Redefiniu a senha de ${target.name}.`,
  });

  revalidatePath("/usuarios");
  return { success: `Senha de ${target.name} redefinida.` };
}
