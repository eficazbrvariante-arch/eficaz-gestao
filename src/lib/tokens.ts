import { randomBytes, createHash } from "crypto";

export function generateResetToken() {
  const rawToken = randomBytes(32).toString("hex");
  const hashedToken = createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, hashedToken };
}

export function hashToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}
