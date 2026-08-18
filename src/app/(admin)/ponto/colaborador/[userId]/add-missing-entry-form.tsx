"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FormBanner } from "@/components/ui/form-banner";
import { toDateTimeLocalValue } from "@/lib/format";
import { ATTENDANCE_TYPE_LABELS } from "@/modules/attendance/attendance-rules";
import { addMissingAttendanceEntryAction } from "../../actions";
import type { AttendanceEntryType } from "@/generated/prisma/enums";

const TYPES: AttendanceEntryType[] = ["CLOCK_IN", "BREAK_START", "BREAK_END", "CLOCK_OUT"];

export function AddMissingEntryForm({
  userId,
  date,
  suggestedType,
  onDone,
}: {
  userId: string;
  /** `YYYY-MM-DD` do dia sendo corrigido. */
  date: string;
  suggestedType: AttendanceEntryType;
  onDone: () => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<AttendanceEntryType>(suggestedType);
  const [occurredAt, setOccurredAt] = useState(
    toDateTimeLocalValue(new Date(`${date}T12:00:00`))
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(undefined);
    if (!reason.trim()) {
      setError("Descreva o motivo da marcação adicionada.");
      return;
    }
    startTransition(async () => {
      const result = await addMissingAttendanceEntryAction({
        userId,
        type,
        occurredAt: new Date(occurredAt),
        reason,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="space-y-2 rounded-md bg-amber-50 p-3">
      <div className="flex flex-wrap gap-2">
        <Select
          value={type}
          onChange={(e) => setType(e.target.value as AttendanceEntryType)}
          className="w-auto"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {ATTENDANCE_TYPE_LABELS[t]}
              {t === suggestedType && " (sugestão)"}
            </option>
          ))}
        </Select>
        <input
          type="datetime-local"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          className="rounded-md border border-slate-300 px-2 text-sm"
        />
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo da marcação adicionada (obrigatório)"
        rows={2}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onDone} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="button" onClick={submit} disabled={isPending}>
          {isPending ? "Salvando..." : "Adicionar marcação"}
        </Button>
      </div>
      <FormBanner message={error} variant="error" />
    </div>
  );
}
