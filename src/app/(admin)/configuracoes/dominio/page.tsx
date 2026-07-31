import Link from "next/link";
import { requireTenant } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { ROOT_DOMAIN } from "@/modules/catalog/tenant-resolver";
import {
  CNAME_TARGET,
  VERIFICATION_RECORD_PREFIX,
} from "@/modules/domain/domain-service";
import { CopyField } from "@/components/ui/copy-field";
import { DomainForm, VerifyDomainButton, RemoveDomainButton } from "./domain-forms";
import type { DomainStatus } from "@/generated/prisma/enums";

const STATUS_INFO: Record<
  DomainStatus,
  { label: string; tone: string; description: string }
> = {
  NONE: {
    label: "Não configurado",
    tone: "bg-slate-100 text-slate-600",
    description: "Sua loja responde apenas pelo subdomínio do sistema.",
  },
  PENDING: {
    label: "Aguardando verificação",
    tone: "bg-amber-50 text-amber-700",
    description:
      "Crie o registro TXT abaixo no seu provedor de DNS e clique em verificar.",
  },
  VERIFIED: {
    label: "Verificado",
    tone: "bg-blue-50 text-blue-700",
    description:
      "A posse do domínio foi confirmada. Falta o apontamento (CNAME) propagar para a loja entrar no ar.",
  },
  ACTIVE: {
    label: "No ar",
    tone: "bg-emerald-50 text-emerald-700",
    description: "Seu domínio está verificado e apontando para a loja.",
  },
};

export default async function ConfiguracoesDominioPage() {
  const { tenant } = await requireTenant();

  const status = STATUS_INFO[tenant.domainStatus];
  const hasDomain = Boolean(tenant.customDomain);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Domínio próprio</h1>
      <p className="mb-6 text-sm text-slate-500">
        Faça seu catálogo responder pelo endereço da sua empresa, no lugar do subdomínio do
        sistema.
      </p>

      {!tenant.catalogEnabled && (
        <div className="mb-6 max-w-3xl rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          O catálogo online está desativado. Mesmo com o domínio conectado, os visitantes não
          verão a loja.{" "}
          <Link href="/configuracoes/catalogo" className="font-medium underline">
            Ativar catálogo
          </Link>
        </div>
      )}

      {/* Endereço atual */}
      <div className="mb-6 max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Endereços da sua loja</h2>
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500">Subdomínio do sistema:</span>
            <code className="rounded bg-slate-100 px-2 py-0.5 text-xs">
              {tenant.subdomain}.{ROOT_DOMAIN}
            </code>
            <span className="text-xs text-slate-400">(sempre funciona)</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500">Domínio próprio:</span>
            {hasDomain ? (
              <>
                <code className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                  {tenant.customDomain}
                </code>
                <span className={`rounded px-2 py-0.5 text-xs ${status.tone}`}>
                  {status.label}
                </span>
              </>
            ) : (
              <span className="text-slate-400">nenhum</span>
            )}
          </div>
        </div>
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          {status.description}
        </p>
        {tenant.domainVerifiedAt && (
          <p className="mt-1 text-xs text-slate-400">
            Verificado em {formatDateTime(tenant.domainVerifiedAt)}
          </p>
        )}
      </div>

      {/* Cadastro */}
      <div className="mb-6 max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">
          {hasDomain ? "Alterar domínio" : "Conectar um domínio"}
        </h2>
        <DomainForm currentDomain={tenant.customDomain} />
      </div>

      {/* Instruções de DNS */}
      {hasDomain && tenant.domainToken && (
        <div className="mb-6 max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">
            Registros de DNS a criar
          </h2>
          <p className="mb-5 text-xs text-slate-500">
            Acesse o painel onde você comprou o domínio (Registro.br, GoDaddy, Hostinger,
            Cloudflare...), procure por &quot;Zona DNS&quot; ou &quot;Gerenciar DNS&quot; e crie
            os dois registros abaixo.
          </p>

          <div className="mb-6 rounded-lg border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                1
              </span>
              <h3 className="text-sm font-medium text-slate-900">
                Provar que o domínio é seu
              </h3>
            </div>
            <div className="space-y-3">
              <CopyField label="Tipo" value="TXT" />
              <CopyField label="Nome / Host" value={VERIFICATION_RECORD_PREFIX} />
              <CopyField label="Valor" value={tenant.domainToken} />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Alguns provedores pedem o nome completo:{" "}
              <code className="rounded bg-slate-100 px-1">
                {VERIFICATION_RECORD_PREFIX}.{tenant.customDomain}
              </code>
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                2
              </span>
              <h3 className="text-sm font-medium text-slate-900">
                Apontar o domínio para a loja
              </h3>
            </div>
            <div className="space-y-3">
              <CopyField label="Tipo" value="CNAME" />
              <CopyField label="Nome / Host" value="@ (ou deixe em branco, para o domínio raiz)" />
              <CopyField label="Valor / Aponta para" value={CNAME_TARGET} />
            </div>
            <p className="mt-3 text-xs text-amber-700">
              Muitos provedores não aceitam CNAME no domínio raiz. Nesse caso, use o recurso
              equivalente do provedor (ALIAS, ANAME ou &quot;CNAME flattening&quot;), ou
              conecte no <code className="rounded bg-slate-100 px-1">www</code> e configure um
              redirecionamento do raiz para o www.
            </p>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <VerifyDomainButton />
          </div>
        </div>
      )}

      {/* SSL */}
      {hasDomain && (
        <div className="mb-6 max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">
            Certificado de segurança (HTTPS)
          </h2>
          <p className="text-sm text-slate-600">
            O certificado é emitido automaticamente pela hospedagem assim que o domínio passa a
            apontar para a aplicação — você não precisa comprar nem instalar nada. A emissão
            costuma levar alguns minutos depois que o DNS propaga.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Enquanto o certificado não sai, o navegador pode exibir um aviso de conexão não
            segura. É temporário.
          </p>
        </div>
      )}

      {hasDomain && (
        <div className="max-w-3xl">
          <RemoveDomainButton />
        </div>
      )}
    </div>
  );
}
