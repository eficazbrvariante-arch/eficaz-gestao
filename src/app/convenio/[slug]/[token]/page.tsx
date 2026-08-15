import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/tokens";
import { parseConvenioRules } from "@/lib/validations/convenio";
import { formatBRL } from "@/lib/format";
import { ConvenioSignupForm } from "./convenio-signup-form";

// Link privado, entregue de mão em mão — nunca deve ser indexado nem
// aparecer como opção pública no catálogo/site (ver item 3 do plano do módulo).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ConvenioSignupPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { token } = await params;

  const invite = await prisma.convenioInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { convenio: true },
  });

  const invalid =
    !invite || invite.revokedAt || (invite.expiresAt && invite.expiresAt < new Date()) || !invite.convenio.active;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        {invalid ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="mb-2 text-lg font-semibold text-slate-900">Link indisponível</h1>
            <p className="text-sm text-slate-500">
              Este link de cadastro não é mais válido. Peça um link novo pra empresa parceira.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-6 text-center">
              {invite.convenio.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- logo de convênio, domínio variável
                <img
                  src={invite.convenio.logoUrl}
                  alt={invite.convenio.name}
                  className="mx-auto mb-3 h-16 w-16 rounded-full object-cover"
                />
              )}
              <h1 className="text-lg font-semibold text-slate-900">
                Convênio {invite.convenio.name}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Cadastre-se como colaborador da {invite.convenio.name} e ganhe{" "}
                <strong>{formatBRL(parseConvenioRules(invite.convenio.rules).benefitAmount)}</strong>{" "}
                de desconto nas suas compras.
              </p>
            </div>

            <ConvenioSignupForm
              token={token}
              requireProof={parseConvenioRules(invite.convenio.rules).requireProof}
            />
          </div>
        )}
      </div>
    </div>
  );
}
