"use server";

import { revalidatePath } from "next/cache";
import { signOut } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { companySchema, type CompanyInput } from "@/lib/validations/company";

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function updateCompanyAction(input: CompanyInput) {
  const user = await requireUser();
  const parsed = companySchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Dados inválidos." };
  }

  const existing = await prisma.tenant.findUnique({ where: { email: parsed.data.email } });
  if (existing && existing.id !== user.tenantId) {
    return { error: "Já existe uma empresa cadastrada com este e-mail." };
  }

  await prisma.tenant.update({
    where: { id: user.tenantId },
    data: parsed.data,
  });

  revalidatePath("/configuracoes/empresa");
  return { success: "Dados da empresa atualizados com sucesso." };
}
