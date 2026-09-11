/**
 * Blob store PRIVADO dos documentos do Crédito Eficaz (`eficaz-documentos`),
 * separado do store público de fotos de produto/ponto/convênio — a Vercel só
 * aceita `access: 'private'` num store criado como privado. Com o store
 * público, todo envio era recusado com "Cannot use private access on a public
 * store" — e como essa resposta volta sem CORS, o navegador enxergava "Failed
 * to fetch", o SDK tratava como falha de rede e ficava retentando por
 * minutos, preso em "Enviando...".
 *
 * Store privado não tem read-write token: autentica por OIDC da Vercel
 * (`VERCEL_OIDC_TOKEN`, automático em runtime) + id do store. As variáveis
 * vêm com o prefixo `CREDITO_BLOB_` definido ao conectar o store ao projeto,
 * justamente pra não colidir com as do store público (`BLOB_*`). Passar
 * `storeId` explícito também impede o SDK de cair no `BLOB_READ_WRITE_TOKEN`.
 */
export function getCreditoEficazBlobStoreId(): string | undefined {
  return process.env.CREDITO_BLOB_STORE_ID || undefined;
}

/** Chave pública que `handleUploadPresigned` exige (verifica callbacks de upload). */
export function getCreditoEficazBlobWebhookPublicKey(): string | undefined {
  return process.env.CREDITO_BLOB_WEBHOOK_PUBLIC_KEY || undefined;
}
