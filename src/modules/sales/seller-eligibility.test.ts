import { describe, expect, it } from "vitest";
import { isSellerAssignable } from "./seller-eligibility";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

describe("isSellerAssignable", () => {
  it("elegível: ADMIN ativo do mesmo tenant", () => {
    expect(isSellerAssignable({ tenantId: TENANT_A, active: true, role: "ADMIN" }, TENANT_A)).toBe(
      true
    );
  });

  it("elegível: MANAGER ativo do mesmo tenant", () => {
    expect(
      isSellerAssignable({ tenantId: TENANT_A, active: true, role: "MANAGER" }, TENANT_A)
    ).toBe(true);
  });

  it("elegível: SELLER ativo do mesmo tenant", () => {
    expect(isSellerAssignable({ tenantId: TENANT_A, active: true, role: "SELLER" }, TENANT_A)).toBe(
      true
    );
  });

  it("não elegível: nenhum usuário encontrado", () => {
    expect(isSellerAssignable(null, TENANT_A)).toBe(false);
  });

  it("não elegível: usuário de outro tenant — nunca deixa vender fora do próprio tenant", () => {
    expect(isSellerAssignable({ tenantId: TENANT_B, active: true, role: "SELLER" }, TENANT_A)).toBe(
      false
    );
  });

  it("não elegível: usuário inativo", () => {
    expect(
      isSellerAssignable({ tenantId: TENANT_A, active: false, role: "SELLER" }, TENANT_A)
    ).toBe(false);
  });

  it("não elegível: STOCKIST não vende", () => {
    expect(
      isSellerAssignable({ tenantId: TENANT_A, active: true, role: "STOCKIST" }, TENANT_A)
    ).toBe(false);
  });

  it("não elegível: STOCK_COLLABORATOR não vende", () => {
    expect(
      isSellerAssignable({ tenantId: TENANT_A, active: true, role: "STOCK_COLLABORATOR" }, TENANT_A)
    ).toBe(false);
  });
});
