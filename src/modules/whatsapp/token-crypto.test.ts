import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./token-crypto";

describe("token-crypto", () => {
  const originalKey = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  afterEach(() => {
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = originalKey;
  });

  it("decifra exatamente o que foi cifrado", () => {
    const plaintext = "EAAG...token-de-acesso-da-meta...xyz";
    const stored = encryptSecret(plaintext);
    expect(stored).not.toContain(plaintext);
    expect(decryptSecret(stored)).toBe(plaintext);
  });

  it("gera um texto cifrado diferente a cada chamada (IV aleatório)", () => {
    const plaintext = "mesmo-valor";
    expect(encryptSecret(plaintext)).not.toBe(encryptSecret(plaintext));
  });

  it("lança um erro claro quando a chave não está configurada", () => {
    delete process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
    expect(() => encryptSecret("qualquer coisa")).toThrow(/WHATSAPP_TOKEN_ENCRYPTION_KEY/);
  });

  it("lança um erro claro quando a chave não tem 32 bytes", () => {
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(() => encryptSecret("qualquer coisa")).toThrow(/32 bytes/);
  });
});
