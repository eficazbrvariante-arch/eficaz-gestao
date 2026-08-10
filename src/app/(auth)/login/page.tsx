import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { TenantLoginFlow } from "./tenant-login-flow";
import { UserPickerLoginForm } from "./user-picker-login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; sessao?: string }>;
}) {
  const { callbackUrl, sessao } = await searchParams;

  const deviceId = (await cookies()).get("device_id")?.value;
  const device = deviceId ? await prisma.device.findUnique({ where: { id: deviceId } }) : null;

  const users =
    device && device.status === "APPROVED"
      ? await prisma.user.findMany({
          where: { tenantId: device.tenantId, active: true },
          select: { id: true, name: true, role: true },
          orderBy: { name: "asc" },
        })
      : null;

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

      {!device ? (
        // Primeira vez neste dispositivo: pede o e-mail de acesso da
        // empresa (não o e-mail pessoal de ninguém) e mostra a lista de
        // colaboradores. Nas próximas visitas, o dispositivo já aprovado
        // pula direto para a lista abaixo.
        <TenantLoginFlow callbackUrl={callbackUrl} />
      ) : device.status === "PENDING" ? (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Dispositivo aguardando aprovação</p>
          <p className="mt-1">
            Assim que o administrador aprovar este dispositivo (id ...
            {device.id.slice(-6)}), você poderá entrar normalmente. Atualize a página
            depois de avisado.
          </p>
        </div>
      ) : device.status === "REJECTED" ? (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
          Este dispositivo foi recusado. Fale com o administrador.
        </div>
      ) : (
        <UserPickerLoginForm users={users ?? []} callbackUrl={callbackUrl} />
      )}

      <div className="mt-6 flex flex-col gap-2 text-sm">
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
