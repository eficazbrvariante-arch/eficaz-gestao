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
    expect(sumWorkedMinutesByDay(entries)).toEqual([{ date: "2026-08-16", workedMinutes: 540 }]);
  });

  it("agrupa e soma vários dias, em ordem cronológica", () => {
    const entries = [
      entry("CLOCK_IN", "2026-08-17T08:00:00-03:00"),
      entry("CLOCK_OUT", "2026-08-17T12:00:00-03:00"),
      entry("CLOCK_IN", "2026-08-16T08:00:00-03:00"),
      entry("CLOCK_OUT", "2026-08-16T17:00:00-03:00"),
    ];
    expect(sumWorkedMinutesByDay(entries)).toEqual([
      { date: "2026-08-16", workedMinutes: 540 },
      { date: "2026-08-17", workedMinutes: 240 },
    ]);
  });

  it("sem marcações, devolve lista vazia", () => {
    expect(sumWorkedMinutesByDay([])).toEqual([]);
  });
});
