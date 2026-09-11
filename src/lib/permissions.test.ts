import { describe, expect, it } from "vitest";
import {
  canCorrectAttendance,
  canEnterProductCostOnCreate,
  canManageProducts,
  canManageStock,
  canQuickEditStockQty,
  canViewAttendancePanel,
  canViewProductCost,
  canViewReports,
  canWaiveAttendanceSelfie,
} from "./permissions";

// Restrições do Gerente pedidas pelo dono em 11/09/2026 — este arquivo existe
// pra nenhuma mudança futura reabrir sem querer o que foi fechado.
describe("Gerente (MANAGER)", () => {
  it("não vê faturamento: relatórios, analytics, dashboard e total do caixa", () => {
    expect(canViewReports("MANAGER")).toBe(false);
    expect(canViewReports("ADMIN")).toBe(true);
  });

  it("não vê o painel de ponto nem corrige marcação, mas continua podendo bater ponto sem selfie", () => {
    expect(canViewAttendancePanel("MANAGER")).toBe(false);
    expect(canCorrectAttendance("MANAGER")).toBe(false);
    expect(canWaiveAttendanceSelfie("MANAGER")).toBe(true);
    expect(canViewAttendancePanel("ADMIN")).toBe(true);
  });

  it("não acessa a área Estoque, mas continua gerenciando produtos", () => {
    expect(canManageStock("MANAGER")).toBe(false);
    expect(canQuickEditStockQty("MANAGER")).toBe(false);
    expect(canManageProducts("MANAGER")).toBe(true);
    expect(canManageStock("STOCKIST")).toBe(true);
    expect(canQuickEditStockQty("STOCK_COLLABORATOR")).toBe(true);
  });

  it("nunca vê o custo de produto salvo; só digita no cadastro se o Admin liberar pra ele", () => {
    expect(canViewProductCost("MANAGER")).toBe(false);
    expect(canEnterProductCostOnCreate("MANAGER", false)).toBe(false);
    expect(canEnterProductCostOnCreate("MANAGER", true)).toBe(true);
  });
});

describe("custo de produto — demais papéis", () => {
  it("Admin e Estoquista veem e lançam; Vendedor nunca, mesmo com a opção marcada", () => {
    expect(canViewProductCost("ADMIN")).toBe(true);
    expect(canViewProductCost("STOCKIST")).toBe(true);
    expect(canEnterProductCostOnCreate("ADMIN", false)).toBe(true);
    expect(canViewProductCost("SELLER")).toBe(false);
    expect(canEnterProductCostOnCreate("SELLER", true)).toBe(false);
  });
});
