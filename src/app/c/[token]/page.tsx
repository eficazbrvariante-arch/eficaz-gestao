import type { Metadata } from "next";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/tokens";
import { CONVENIO_MEMBER_STATUS_LABELS } from "@/lib/validations/convenio";

// "Carteirinha" do colaborador — nunca indexada, o token é a única credencial.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ConvenioCredentialPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const member = await prisma.convenioMember.findUnique({
    where: { credentialTokenHash: hashToken(token) },
    include: { convenio: { select: { name: true, logoUrl: true, active: true } } },
  });

  const expired = member?.validUntil && member.validUntil < new Date();
  const isActive = member && member.status === "ACTIVE" && member.convenio.active && !expired;

  let qrSvg: string | null = null;
  if (isActive) {
    const origin = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    qrSvg = await QRCode.toString(`${origin}/c/${token}`, { type: "svg", margin: 0 });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        {!member ? (
          <>
            <h1 className="mb-2 text-lg font-semibold text-slate-900">Carteirinha não encontrada</h1>
            <p className="text-sm text-slate-500">Confira o link e tente novamente.</p>
          </>
        ) : (
          <>
            <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">
              Convênio {member.convenio.name}
            </p>
            <h1 className="mt-1 mb-4 text-lg font-semibold text-slate-900">{member.name}</h1>

            {isActive && qrSvg ? (
              <>
                <div
                  className="mx-auto mb-3 w-48 max-w-full"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
                <p className="mb-4 text-xs text-slate-500">
                  Mostre este QR Code no caixa pra usar seu benefício.
                </p>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                    Ou informe seu código
                  </p>
                  <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-slate-900">
                    {member.shortCode}
                  </p>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-700">
                  {expired
                    ? "Cadastro expirado"
                    : !member.convenio.active
                      ? "Convênio indisponível no momento"
                      : CONVENIO_MEMBER_STATUS_LABELS[member.status]}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {member.status === "PENDING"
                    ? "Assim que seu cadastro for aprovado, o QR Code aparece aqui."
                    : "Fale com a loja se achar que isso é um engano."}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
