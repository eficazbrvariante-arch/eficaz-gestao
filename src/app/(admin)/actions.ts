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

  await prisma.tenant.update({
    where: { id: user.tenantId },
    data: parsed.data,
  });

  revalidatePath("/configuracoes/empresa");
  return { success: "Dados da empresa atualizados com sucesso." };
}
