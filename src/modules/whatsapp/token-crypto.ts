import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifra/decifra o access token da integração antes de gravar no banco
 * (`WhatsAppIntegration.accessToken`). Diferente do hash de senha/token de
 * reset usado em `User`/`Customer` (unidirecional), aqui precisamos recuperar
 * o valor original para chamar a Graph API — por isso AES-256-GCM (simétrico,
 * reversível) em vez de bcrypt/SHA-256.
 *
 * Formato armazenado: "<iv base64>.<authTag base64>.<ciphertext base64>".
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;

class WhatsAppEncryptionKeyError extends Error {}

function getEncryptionKey(): Buffer {
  const raw = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new WhatsAppEncryptionKeyError(
      "WHATSAPP_TOKEN_ENCRYPTION_KEY não configurada — necessária para cifrar/decifrar credenciais do WhatsApp.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new WhatsAppEncryptionKeyError(
      `WHATSAPP_TOKEN_ENCRYPTION_KEY deve decodificar para ${KEY_LENGTH_BYTES} bytes em base64 (ex.: gerar com "openssl rand -base64 32").`,
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((part) => part.toString("base64")).join(".");
}

export function decryptSecret(stored: string): string {
  const key = getEncryptionKey();
  const [ivB64, authTagB64, ciphertextB64] = stored.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Valor cifrado em formato inesperado.");
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
