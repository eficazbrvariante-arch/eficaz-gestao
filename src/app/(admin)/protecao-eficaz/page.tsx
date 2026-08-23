import { requireUser } from "@/lib/session";
import { canManageProtecaoEficaz } from "@/lib/permissions";
import { listProtecaoEficazForAdmin } from "@/modules/protecao-eficaz/protecao-eficaz-service";
import { ProtecaoEficazLista } from "./protecao-eficaz-lista";

export default async function ProtecaoEficazPage() {
  const user = await requireUser();
  if (!canManageProtecaoEficaz(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar a Proteção Eficaz.
      </div>
    );
  }

  const registrations = await listProtecaoEficazForAdmin(user.tenantId);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Proteção Eficaz</h1>
        <p className="text-sm text-text-muted">
          Cadastros enviados pelos clientes — compare a foto da nota com o rascunho da venda antes
          de aprovar.
        </p>
      </div>

      <ProtecaoEficazLista registrations={registrations} />
    </div>
  );
}
