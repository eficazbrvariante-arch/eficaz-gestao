import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/tokens";

/**
 * Upload sem login — usado pelo formulário público de cadastro de
 * colaborador (`/convenio/[slug]/[token]`), que não tem sessão nenhuma.
 * `clientPayload` carrega o token bruto do convite: exige um convite válido
 * (não revogado/expirado) antes de emitir o token de upload, pra não deixar
 * este endpoint como upload anônimo livre pra qualquer um na internet.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        if (!clientPayload) throw new Error("Convite inválido.");
        const invite = await prisma.convenioInvite.findUnique({
          where: { tokenHash: hashToken(clientPayload) },
        });
        if (!invite || invite.revokedAt || (invite.expiresAt && invite.expiresAt < new Date())) {
          throw new Error("Convite inválido ou expirado.");
        }
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: 5 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha no upload" },
      { status: 400 }
    );
  }
}
