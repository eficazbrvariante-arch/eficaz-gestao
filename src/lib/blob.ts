import { del } from "@vercel/blob";

export async function deleteBlob(url: string) {
  try {
    await del(url);
  } catch {
    // A referência no banco é a fonte da verdade: se o blob já não existir ou
    // não pertencer a este storage (ex.: URL antiga colada manualmente), a
    // falha aqui não deve impedir a atualização do registro.
  }
}
