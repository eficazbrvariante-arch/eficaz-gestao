import { describe, expect, it } from "vitest";
import {
  parseFlashDealSchedule,
  todayFlashDealEntry,
  flashPriceOverrideFor,
  nextMidnightSaoPaulo,
  type FlashDealDayEntry,
} from "./flash-deal-service";

/**
 * Meio-dia UTC de um dia de agosto/2026 = 09:00 em São Paulo (sem horário de
 * verão, offset -03:00 fixo) — sempre dentro do mesmo dia civil em ambos os
 * fusos, então `.getDay()` em UTC já dá o dia da semana certo pra São Paulo,
 * sem precisar reimplementar a conversão de fuso aqui.
 */
function utcNoon(day: number): Date {
  return new Date(Date.UTC(2026, 7, day, 12, 0, 0));
}

// 7 dias consecutivos reais (3 a 9 de agosto/2026) — cobrem os 7 dias da
// semana em alguma ordem, cada um com produto/preço próprios.
const WEEK_DATES = [3, 4, 5, 6, 7, 8, 9].map(utcNoon);
const WEEKDAY_OF = WEEK_DATES.map((d) => d.getDay());

function makeEntry(overrides: Partial<FlashDealDayEntry> & { day: number }): FlashDealDayEntry {
  return {
    active: true,
    productId: `product-day-${overrides.day}`,
    promoPrice: 10 + overrides.day,
    orderLimit: 1,
    badgeText: "Só hoje!",
    icon: "lightning",
    bgColor: "#b91c1c",
    accentColor: "#fbbf24",
    soundEnabled: false,
    ...overrides,
  };
}

const FULL_WEEK_SCHEDULE: FlashDealDayEntry[] = WEEKDAY_OF.map((day) => makeEntry({ day }));

describe("todayFlashDealEntry — os 7 dias da semana", () => {
  it("resolve o produto certo em cada um dos 7 dias, sem vazamento entre dias", () => {
    expect(new Set(WEEKDAY_OF).size).toBe(7); // garante que os 7 dias fixtures cobrem a semana inteira

    for (let i = 0; i < 7; i++) {
      const now = WEEK_DATES[i];
      const day = WEEKDAY_OF[i];
      const entry = todayFlashDealEntry(FULL_WEEK_SCHEDULE, now);

      expect(entry, `dia ${day}`).not.toBeNull();
      expect(entry!.day).toBe(day);
      expect(entry!.productId).toBe(`product-day-${day}`);
      expect(entry!.promoPrice).toBe(10 + day);

      const otherDays = WEEKDAY_OF.filter((d) => d !== day);
      for (const other of otherDays) {
        expect(entry!.productId).not.toBe(`product-day-${other}`);
      }
    }
  });

  it("dia desativado não aparece, mesmo com produto e preço configurados", () => {
    const day = WEEKDAY_OF[0];
    const schedule = [makeEntry({ day, active: false })];
    expect(todayFlashDealEntry(schedule, WEEK_DATES[0])).toBeNull();
  });

  it("dia sem produto selecionado devolve null", () => {
    const day = WEEKDAY_OF[0];
    const schedule = [makeEntry({ day, productId: null })];
    expect(todayFlashDealEntry(schedule, WEEK_DATES[0])).toBeNull();
  });

  it("dia sem preço promocional devolve null", () => {
    const day = WEEKDAY_OF[0];
    const schedule = [makeEntry({ day, promoPrice: null })];
    expect(todayFlashDealEntry(schedule, WEEK_DATES[0])).toBeNull();
  });

  it("agenda sem nenhuma entrada para o dia devolve null", () => {
    expect(todayFlashDealEntry([], WEEK_DATES[0])).toBeNull();
  });
});

describe("flashPriceOverrideFor", () => {
  const entry = makeEntry({ day: 1, productId: "p1", promoPrice: 50 });

  it("aplica quando o produto bate e o preço configurado é um desconto de verdade", () => {
    const override = flashPriceOverrideFor(entry, { id: "p1", salePrice: 100 });
    expect(override?.promoPrice).toBe(50);
  });

  it("não aplica para um produto diferente do configurado no dia", () => {
    expect(flashPriceOverrideFor(entry, { id: "outro-produto", salePrice: 100 })).toBeNull();
  });

  it("não aplica quando o preço configurado não é menor que o preço de venda (oferta mal configurada)", () => {
    expect(flashPriceOverrideFor(entry, { id: "p1", salePrice: 40 })).toBeNull();
    expect(flashPriceOverrideFor(entry, { id: "p1", salePrice: 50 })).toBeNull();
  });

  it("não aplica quando não há entrada para o dia", () => {
    expect(flashPriceOverrideFor(null, { id: "p1", salePrice: 100 })).toBeNull();
  });
});

describe("parseFlashDealSchedule", () => {
  it("aceita uma agenda de 7 entradas válidas", () => {
    expect(parseFlashDealSchedule(FULL_WEEK_SCHEDULE)).toHaveLength(7);
  });

  it("descarta silenciosamente entradas malformadas, mantendo as válidas", () => {
    const malformed = [...FULL_WEEK_SCHEDULE.slice(0, 6), { day: 6 }];
    expect(parseFlashDealSchedule(malformed)).toHaveLength(6);
  });

  it("devolve array vazio quando o valor guardado não é um array", () => {
    expect(parseFlashDealSchedule(null)).toEqual([]);
    expect(parseFlashDealSchedule(undefined)).toEqual([]);
    expect(parseFlashDealSchedule("não é um array")).toEqual([]);
  });
});

describe("nextMidnightSaoPaulo", () => {
  it("devolve a meia-noite do dia seguinte em America/Sao_Paulo", () => {
    const now = new Date("2026-08-03T15:00:00-03:00");
    const midnight = nextMidnightSaoPaulo(now);
    expect(midnight.toISOString()).toBe(new Date("2026-08-04T00:00:00-03:00").toISOString());
  });

  it("já perto da meia-noite, ainda devolve a meia-noite seguinte (não a de hoje)", () => {
    const now = new Date("2026-08-03T23:59:00-03:00");
    const midnight = nextMidnightSaoPaulo(now);
    expect(midnight.toISOString()).toBe(new Date("2026-08-04T00:00:00-03:00").toISOString());
  });
});
