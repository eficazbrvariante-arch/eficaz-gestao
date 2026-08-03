import { NextResponse } from "next/server";
import { ensureRepairOrderReceiptUrl } from "@/modules/repairs/receipt-service";

/**
 * Link público (sem login) enviado ao cliente pelo WhatsApp — o `id` da OS já
 * é um cuid não adivinhável, então não há necessidade de outro segredo aqui.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await ensureRepairOrderReceiptUrl(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.redirect(result.blobUrl);
}
