import { describe, expect, it } from "vitest";
import { sumWorkedMinutesByDay } from "./hourly-payment-service";
import type { EffectiveAttendanceEntry } from "@/modules/attendance/attendance-service";

function entry(
  type: EffectiveAttendanceEntry["type"],
  occurredAt: string
): EffectiveAttendanceEntry {
  return {
    id: `${type}-${occurredAt}`,
    userId: "user-1",
    type,
    occurredAt: new Date(occurredAt),
    corrected: false,
    selfieUrl: null,
    selfieWaived: false,
  };
}

describe("sumWorkedMinutesByDay", () => {
  it("soma um único dia completo (8h com 1h de intervalo)", () => {
    const entries = [
      entry("CLOCK_IN", "2026-08-16T08:00:00-03:00"),
      entry("BREAK_START", "2026-08-16T12:00:00-03:00"),
      entry("BREAK_END", "2026-08-16T13:00:00-03:00"),
      entry("CLOCK_OUT", "2026-08-16T18:00:00-03:00"),
    ];
    expect(sumWorkedMinutesByDay(entries)).toEqual([
      { date: "2026-08-16", workedMinutes: 540, incomplete: false },
    ]);
  });

  it("agrupa e soma vários dias, em ordem cronológica", () => {
    const entries = [
      entry("CLOCK_IN", "2026-08-17T08:00:00-03:00"),
      entry("CLOCK_OUT", "2026-08-17T12:00:00-03:00"),
      entry("CLOCK_IN", "2026-08-16T08:00:00-03:00"),
      entry("CLOCK_OUT", "2026-08-16T17:00:00-03:00"),
    ];
    expect(sumWorkedMinutesByDay(entries)).toEqual([
      { date: "2026-08-16", workedMinutes: 540, incomplete: false },
      { date: "2026-08-17", workedMinutes: 240, incomplete: false },
    ]);
  });

  it("sem marcações, devolve lista vazia", () => {
    expect(sumWorkedMinutesByDay([])).toEqual([]);
  });

  it("dia PASSADO sem saída batida: fica zerado e marcado como incompleto, nunca extrapola até agora", () => {
    // Bug real: colaborador esqueceu de bater saída em 12/08, e a soma
    // (sem essa trava) contava até "agora" (17/08) como se tivesse
    // trabalhado ~5 dias seguidos nesse único dia.
    const entries = [entry("CLOCK_IN", "2026-08-12T08:00:00-03:00")];
    const now = new Date("2026-08-17T15:00:00-03:00");
    expect(sumWorkedMinutesByDay(entries, now)).toEqual([
      { date: "2026-08-12", workedMinutes: 0, incomplete: true },
    ]);
  });

  it("dia de HOJE sem saída batida: conta normalmente até agora, não é incompleto", () => {
    // Turno em andamento — comportamento correto e esperado, só o dia
    // corrente pode ficar "aberto" sem virar um alerta de marcação faltando.
    const entries = [entry("CLOCK_IN", "2026-08-17T08:00:00-03:00")];
    const now = new Date("2026-08-17T10:30:00-03:00");
    expect(sumWorkedMinutesByDay(entries, now)).toEqual([
      { date: "2026-08-17", workedMinutes: 150, incomplete: false },
    ]);
  });

  it("mistura dia completo, dia passado incompleto e hoje em andamento", () => {
    const entries = [
      entry("CLOCK_IN", "2026-08-15T08:00:00-03:00"),
      entry("CLOCK_OUT", "2026-08-15T12:00:00-03:00"),
      entry("CLOCK_IN", "2026-08-16T08:00:00-03:00"),
      // 16/08 nunca bateu saída.
      entry("CLOCK_IN", "2026-08-17T08:00:00-03:00"),
    ];
    const now = new Date("2026-08-17T09:00:00-03:00");
    expect(sumWorkedMinutesByDay(entries, now)).toEqual([
      { date: "2026-08-15", workedMinutes: 240, incomplete: false },
      { date: "2026-08-16", workedMinutes: 0, incomplete: true },
      { date: "2026-08-17", workedMinutes: 60, incomplete: false },
    ]);
  });
});
