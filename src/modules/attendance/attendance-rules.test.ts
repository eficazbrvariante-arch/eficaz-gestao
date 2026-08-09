import { describe, expect, it } from "vitest";
import {
  computeWorkedMinutes,
  formatWorkedMinutes,
  getNextExpectedAttendanceType,
  resolveEffectiveAttendanceEntry,
} from "./attendance-rules";

describe("getNextExpectedAttendanceType", () => {
  it("dia vazio: próxima marcação é a entrada", () => {
    expect(getNextExpectedAttendanceType([])).toBe("CLOCK_IN");
  });

  it("depois de CLOCK_IN: próxima é BREAK_START", () => {
    expect(
      getNextExpectedAttendanceType([{ type: "CLOCK_IN", occurredAt: new Date("2026-08-09T08:00:00-03:00") }])
    ).toBe("BREAK_START");
  });

  it("depois de CLOCK_IN + BREAK_START: próxima é BREAK_END", () => {
    expect(
      getNextExpectedAttendanceType([
        { type: "CLOCK_IN", occurredAt: new Date("2026-08-09T08:00:00-03:00") },
        { type: "BREAK_START", occurredAt: new Date("2026-08-09T12:00:00-03:00") },
      ])
    ).toBe("BREAK_END");
  });

  it("ciclo completo: próxima é CLOCK_OUT", () => {
    expect(
      getNextExpectedAttendanceType([
        { type: "CLOCK_IN", occurredAt: new Date("2026-08-09T08:00:00-03:00") },
        { type: "BREAK_START", occurredAt: new Date("2026-08-09T12:00:00-03:00") },
        { type: "BREAK_END", occurredAt: new Date("2026-08-09T13:00:00-03:00") },
      ])
    ).toBe("CLOCK_OUT");
  });

  it("depois de CLOCK_OUT: dia encerrado, não há próxima marcação", () => {
    expect(
      getNextExpectedAttendanceType([
        { type: "CLOCK_IN", occurredAt: new Date("2026-08-09T08:00:00-03:00") },
        { type: "BREAK_START", occurredAt: new Date("2026-08-09T12:00:00-03:00") },
        { type: "BREAK_END", occurredAt: new Date("2026-08-09T13:00:00-03:00") },
        { type: "CLOCK_OUT", occurredAt: new Date("2026-08-09T18:00:00-03:00") },
      ])
    ).toBe(null);
  });

  it("ordena por occurredAt antes de decidir — defensivo contra entrada fora de ordem", () => {
    expect(
      getNextExpectedAttendanceType([
        { type: "BREAK_START", occurredAt: new Date("2026-08-09T12:00:00-03:00") },
        { type: "CLOCK_IN", occurredAt: new Date("2026-08-09T08:00:00-03:00") },
      ])
    ).toBe("BREAK_END");
  });
});

describe("resolveEffectiveAttendanceEntry", () => {
  const original = { type: "CLOCK_IN" as const, occurredAt: new Date("2026-08-09T08:00:00-03:00") };

  it("sem correções, devolve o original", () => {
    expect(resolveEffectiveAttendanceEntry(original, [])).toEqual({
      type: "CLOCK_IN",
      occurredAt: original.occurredAt,
      corrected: false,
    });
  });

  it("com uma correção, devolve os valores da correção", () => {
    const correction = {
      newType: "CLOCK_IN" as const,
      newOccurredAt: new Date("2026-08-09T08:05:00-03:00"),
      createdAt: new Date("2026-08-09T10:00:00-03:00"),
    };
    expect(resolveEffectiveAttendanceEntry(original, [correction])).toEqual({
      type: "CLOCK_IN",
      occurredAt: correction.newOccurredAt,
      corrected: true,
    });
  });

  it("com múltiplas correções, devolve sempre a mais recente por createdAt", () => {
    const older = {
      newType: "CLOCK_IN" as const,
      newOccurredAt: new Date("2026-08-09T08:05:00-03:00"),
      createdAt: new Date("2026-08-09T10:00:00-03:00"),
    };
    const newer = {
      newType: "CLOCK_IN" as const,
      newOccurredAt: new Date("2026-08-09T08:10:00-03:00"),
      createdAt: new Date("2026-08-09T11:00:00-03:00"),
    };
    expect(resolveEffectiveAttendanceEntry(original, [older, newer]).occurredAt).toEqual(
      newer.newOccurredAt
    );
  });
});

describe("computeWorkedMinutes", () => {
  it("dia completo (4 marcações) soma os dois intervalos trabalhados descontando o intervalo", () => {
    const entries = [
      { type: "CLOCK_IN" as const, occurredAt: new Date("2026-08-09T08:00:00-03:00") },
      { type: "BREAK_START" as const, occurredAt: new Date("2026-08-09T12:00:00-03:00") },
      { type: "BREAK_END" as const, occurredAt: new Date("2026-08-09T13:00:00-03:00") },
      { type: "CLOCK_OUT" as const, occurredAt: new Date("2026-08-09T18:00:00-03:00") },
    ];
    // 08:00-12:00 (4h) + 13:00-18:00 (5h) = 9h = 540min
    expect(computeWorkedMinutes(entries)).toEqual({ workedMinutes: 540, open: false });
  });

  it("dia sem intervalo (só entrada/saída) calcula direto", () => {
    const entries = [
      { type: "CLOCK_IN" as const, occurredAt: new Date("2026-08-09T08:00:00-03:00") },
      { type: "CLOCK_OUT" as const, occurredAt: new Date("2026-08-09T17:00:00-03:00") },
    ];
    expect(computeWorkedMinutes(entries)).toEqual({ workedMinutes: 540, open: false });
  });

  it("dia só com CLOCK_IN (ainda em andamento) não fecha um total, sinaliza em aberto", () => {
    const entries = [{ type: "CLOCK_IN" as const, occurredAt: new Date("2026-08-09T08:00:00-03:00") }];
    const now = new Date("2026-08-09T10:00:00-03:00");
    expect(computeWorkedMinutes(entries, now)).toEqual({ workedMinutes: 120, open: true });
  });

  it("sem CLOCK_IN, não há como calcular", () => {
    expect(computeWorkedMinutes([])).toEqual({ workedMinutes: 0, open: false });
  });

  it("em intervalo agora (BREAK_START sem BREAK_END): não conta o tempo de intervalo", () => {
    const entries = [
      { type: "CLOCK_IN" as const, occurredAt: new Date("2026-08-09T08:00:00-03:00") },
      { type: "BREAK_START" as const, occurredAt: new Date("2026-08-09T12:00:00-03:00") },
    ];
    const now = new Date("2026-08-09T12:30:00-03:00");
    expect(computeWorkedMinutes(entries, now)).toEqual({ workedMinutes: 240, open: true });
  });
});

describe("formatWorkedMinutes", () => {
  it("horas e minutos", () => expect(formatWorkedMinutes(510)).toBe("8h 30min"));
  it("só horas", () => expect(formatWorkedMinutes(480)).toBe("8h"));
  it("só minutos", () => expect(formatWorkedMinutes(45)).toBe("45min"));
  it("zero", () => expect(formatWorkedMinutes(0)).toBe("0min"));
});
