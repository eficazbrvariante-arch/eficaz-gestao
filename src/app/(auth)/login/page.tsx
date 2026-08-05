import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { LoginForm } from "./login-form";
import { UserPickerLoginForm } from "./user-picker-login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; sessao?: string; modo?: string }>;
}) {
  const { callbackUrl, sessao, modo } = await searchParams;

  const deviceId = (await cookies()).get("device_id")?.value;
  const device = deviceId ? await prisma.device.findUnique({ where: { id: deviceId } }) : null;

  // Sem dispositivo reconhecido, ou o usuário pediu explicitamente pra digitar
  // e-mail (?modo=email) — mostra o formulário clássico de sempre, inalterado.
  const showClassicForm = !device || modo === "email";

  const users =
    device && device.status === "APPROVED" && !showClassicForm
      ? await prisma.user.findMany({
          where: { tenantId: device.tenantId, active: true },
          select: { id: true, name: true, role: true },
          orderBy: { name: "asc" },
        })
      : null;

  const emailModeHref = `/login?modo=email${callbackUrl ? `&callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`;

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Entrar</h1>
      <p className="mb-6 text-sm text-slate-500">
        Acesse o painel administrativo da sua empresa.
      </p>

      {sessao === "expirada" && (
        <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Sua sessão não é mais válida. Entre novamente para continuar.
        </div>
      )}

      {showClassicForm ? (
        <LoginForm callbackUrl={callbackUrl} />
      ) : device!.status === "PENDING" ? (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Dispositivo aguardando aprovação</p>
          <p className="mt-1">
            Assim que o administrador aprovar este dispositivo (id ...
            {device!.id.slice(-6)}), você poderá entrar normalmente. Atualize a página
            depois de avisado.
          </p>
        </div>
      ) : device!.status === "REJECTED" ? (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
          Este dispositivo foi recusado. Fale com o administrador.
        </div>
      ) : (
        <UserPickerLoginForm users={users ?? []} callbackUrl={callbackUrl} />
      )}

      <div className="mt-6 flex flex-col gap-2 text-sm">
        {!showClassicForm && device!.status === "APPROVED" && (
          <Link href={emailModeHref} className="text-slate-600 hover:text-slate-900">
            Entrar com e-mail
          </Link>
        )}
        <Link href="/recuperar-senha" className="text-slate-600 hover:text-slate-900">
          Esqueci minha senha
        </Link>
        <span className="text-slate-500">
          Ainda não tem uma empresa cadastrada?{" "}
          <Link href="/cadastro" className="font-medium text-slate-900 hover:underline">
            Criar cadastro
          </Link>
        </span>
      </div>
    </div>
  );
}
