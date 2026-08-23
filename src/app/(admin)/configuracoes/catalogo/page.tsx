import Link from "next/link";
import { requireTenant } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ROOT_DOMAIN } from "@/modules/catalog/tenant-resolver";
import { CatalogSettingsForm } from "./catalog-settings-form";

export default async function ConfiguracoesCatalogoPage() {
  const { user, tenant } = await requireTenant();

  const [totalProducts, visibleCount] = await Promise.all([
    prisma.product.count({ where: { tenantId: user.tenantId } }),
    prisma.product.count({
      where: { tenantId: user.tenantId, active: true, showInCatalog: true },
    }),
  ]);

  const storePath = `/loja/${tenant.subdomain}`;

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-foreground">Catálogo online</h1>
      <p className="mb-6 text-sm text-text-muted">
        A vitrine pública mostra automaticamente os produtos ativos marcados como
        &quot;Mostrar no catálogo online&quot;. Preço e estoque acompanham o PDV em tempo real.
      </p>

      <div className="mb-6 max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Endereço da sua loja</h2>
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500">Link direto:</span>
            <Link href={storePath} className="font-medium text-slate-900 hover:underline">
              {storePath}
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500">Subdomínio:</span>
            <code className="rounded bg-slate-100 px-2 py-0.5 text-xs">
              {tenant.subdomain}.{ROOT_DOMAIN}
            </code>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500">Domínio próprio:</span>
            {tenant.customDomain ? (
              <code className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                {tenant.customDomain}
              </code>
            ) : (
              <span className="text-slate-400">
                não configurado — a conexão de domínio próprio entra na Fase 7
              </span>
            )}
          </div>
        </div>

        <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
          {visibleCount} de {totalProducts} produto(s) estão visíveis no catálogo.
          {visibleCount === 0 && (
            <>
              {" "}
              <Link href="/produtos" className="font-medium text-slate-700 underline">
                Marque produtos para o catálogo
              </Link>{" "}
              para a loja não ficar vazia.
            </>
          )}
        </p>
      </div>

      <div className="max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Aparência</h2>
        <CatalogSettingsForm
          defaultValues={{
            catalogEnabled: tenant.catalogEnabled,
            logoUrl: tenant.logoUrl ?? "",
            bannerUrl: tenant.bannerUrl ?? "",
            bannerTitle: tenant.bannerTitle ?? "",
            bannerSubtitle: tenant.bannerSubtitle ?? "",
          }}
        />
      </div>
    </div>
  );
}
