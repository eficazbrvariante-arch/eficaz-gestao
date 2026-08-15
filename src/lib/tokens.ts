import { randomBytes, randomInt, createHash } from "crypto";

export function generateResetToken() {
  const rawToken = randomBytes(32).toString("hex");
  const hashedToken = createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, hashedToken };
}

export function hashToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Código numérico curto (ex.: 6 dígitos, com zero à esquerda se preciso). */
export function generateShortCode(length: number): string {
  return randomInt(0, 10 ** length).toString().padStart(length, "0");
}
