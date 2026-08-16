import { describe, expect, it } from "vitest";
import { computeProtectionExpiresAt } from "./protecao-eficaz-service";

describe("computeProtectionExpiresAt", () => {
  it("30 dias a partir da data da venda, não de hoje", () => {
    const saleCreatedAt = new Date("2026-01-01T12:00:00-03:00");
    const expires = computeProtectionExpiresAt(saleCreatedAt);
    expect(expires.toISOString()).toBe(new Date("2026-01-31T12:00:00-03:00").toISOString());
  });

  it("atravessa virada de mês corretamente", () => {
    const saleCreatedAt = new Date("2026-08-20T09:00:00-03:00");
    const expires = computeProtectionExpiresAt(saleCreatedAt);
    expect(expires.toISOString()).toBe(new Date("2026-09-19T09:00:00-03:00").toISOString());
  });
});
