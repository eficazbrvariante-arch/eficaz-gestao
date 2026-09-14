import { describe, expect, it } from "vitest";
import { cashMovementSchema } from "./cash";

const base = { amount: 5.5, description: "Compra de insumo", performedById: "user-1" };

// Pedido do dono (14/09/2026): quem está fazendo sempre; sangria exige cupom ou selfie.
describe("cashMovementSchema", () => {
  it("sangria sem cupom e sem selfie é recusada", () => {
    expect(cashMovementSchema.safeParse({ ...base, type: "WITHDRAWAL" }).success).toBe(false);
  });

  it("sangria com cupom ou com selfie passa", () => {
    expect(
      cashMovementSchema.safeParse({ ...base, type: "WITHDRAWAL", receiptPhotoUrl: "https://x.test/cupom.jpg" }).success
    ).toBe(true);
    expect(
      cashMovementSchema.safeParse({ ...base, type: "WITHDRAWAL", selfieUrl: "https://x.test/selfie.jpg" }).success
    ).toBe(true);
  });

  it("suprimento não exige foto", () => {
    expect(cashMovementSchema.safeParse({ ...base, type: "SUPPLY" }).success).toBe(true);
  });

  it("sem \"quem está fazendo\" é recusada", () => {
    expect(
      cashMovementSchema.safeParse({ ...base, performedById: "", type: "SUPPLY" }).success
    ).toBe(false);
  });
});
