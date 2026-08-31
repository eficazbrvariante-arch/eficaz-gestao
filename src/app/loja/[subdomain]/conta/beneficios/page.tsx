import Link from "next/link";
import { requireCustomerAccountSession } from "../require-customer-account";
import { BackToAccountLink } from "../back-to-account-link";
import { getCustomerConvenioBenefit } from "@/modules/convenios/convenio-customer-benefit";
import { formatBRL } from "@/lib/format";

export default async function BeneficiosAccountPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const { session, base } = await requireCustomerAccountSession(
    subdomain,
    `/loja/${subdomain}/conta/beneficios`
  );

  const convenioBenefit = await getCustomerConvenioBenefit(session.customerId);

  return (
    <div>
      <BackToAccountLink base={base} />
      {!convenioBenefit ? (
        <p className="text-sm text-slate-500">Você não tem nenhum benefício de convênio no momento.</p>
      ) : (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <h1 className="mb-1 text-sm font-semibold text-emerald-900">
          Convênio {convenioBenefit.convenioName}
        </h1>
        {!convenioBenefit.active ? (
          <p className="text-sm text-emerald-800">
            Seu cadastro no convênio não está ativo no momento — fale com a loja se achar que isso
            é um engano.
          </p>
        ) : convenioBenefit.vitrine.length === 0 ? (
          <p className="text-sm text-emerald-800">
            Você tem o desconto do convênio disponível no balcão da loja. Ainda não há produtos com
            desconto exclusivo no site.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-emerald-800">
              Além do desconto no balcão da loja, você tem desconto exclusivo nestes produtos do
              site:
            </p>
            <ul className="space-y-2">
              {convenioBenefit.vitrine.map((item) => (
                <li key={item.productId}>
                  <Link
                    href={`${base}/produto/${item.productId}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-white p-3 text-sm hover:bg-emerald-50/50"
                  >
                    <span className="text-slate-800">{item.name}</span>
                    <span className="shrink-0 text-right">
                      <span className="mr-1.5 text-xs text-slate-400 line-through">
                        {formatBRL(item.catalogPrice)}
                      </span>
                      <span className="font-semibold text-emerald-700">
                        {formatBRL(item.finalPrice)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      )}
    </div>
  );
}
