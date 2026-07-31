"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/lib/auth";
import { generateResetToken, hashToken } from "@/lib/tokens";
import {
  loginSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  signupSchema,
  type LoginInput,
  type RequestPasswordResetInput,
  type ResetPasswordInput,
  type SignupInput,
} from "@/lib/validations/auth";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

export async function loginAction(input: LoginInput, callbackUrl?: string) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Dados inválidos." };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { error: "E-mail ou senha inválidos." };
        default:
          return { error: "Não foi possível entrar. Tente novamente." };
      }
    }
    throw error;
  }
}

export async function signupAction(input: SignupInput) {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Dados inválidos." };
  }
  const { companyName, subdomain, adminName, email, password } = parsed.data;

  const [existingTenant, existingUser] = await Promise.all([
    prisma.tenant.findUnique({ where: { subdomain } }),
    prisma.user.findUnique({ where: { email } }),
  ]);

  if (existingTenant) {
    return { error: "Este subdomínio já está em uso. Escolha outro." };
  }
  if (existingUser) {
    return { error: "Já existe uma conta com este e-mail." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.tenant.create({
    data: {
      name: companyName,
      subdomain,
      users: {
        create: {
          name: adminName,
          email,
          passwordHash,
          role: "ADMIN",
        },
      },
    },
  });

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Empresa criada, mas não foi possível entrar automaticamente. Faça login." };
    }
    throw error;
  }
}

export async function requestPasswordResetAction(input: RequestPasswordResetInput) {
  const parsed = requestPasswordResetSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Informe um e-mail válido." };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  if (user) {
    const { rawToken, hashedToken } = generateResetToken();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: hashedToken,
        resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const resetUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/redefinir-senha/${rawToken}`;

    // TODO(fase 1): integrar um provedor de e-mail transacional (ex.: Resend) e enviar `resetUrl`.
    // Enquanto isso, o link é registrado no log do servidor para viabilizar testes locais.
    console.log(`[recuperação de senha] link para ${user.email}: ${resetUrl}`);
  }

  // Mensagem genérica sempre, para não revelar se o e-mail existe na base.
  return {
    success:
      "Se este e-mail estiver cadastrado, você receberá instruções para redefinir sua senha em instantes.",
  };
}

export async function resetPasswordAction(input: ResetPasswordInput) {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Dados inválidos." };
  }
  const { token, password } = parsed.data;
  const hashedToken = hashToken(token);

  const user = await prisma.user.findUnique({ where: { resetToken: hashedToken } });

  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    return { error: "Link de redefinição inválido ou expirado. Solicite um novo." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      resetToken: null,
      resetTokenExpiresAt: null,
    },
  });

  redirect("/login");
}
