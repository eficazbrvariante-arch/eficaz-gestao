"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FormBanner } from "@/components/ui/form-banner";
import { toDateTimeLocalValue } from "@/lib/format";
import { ATTENDANCE_TYPE_LABELS } from "@/modules/attendance/attendance-rules";
import { correctAttendanceEntryAction } from "../../actions";
import type { AttendanceEntryType } from "@/generated/prisma/enums";

const TYPES: AttendanceEntryType[] = ["CLOCK_IN", "BREAK_START", "BREAK_END", "CLOCK_OUT"];

export function AttendanceCorrectionForm({
  entryId,
  currentType,
  currentOccurredAt,
  onDone,
}: {
  entryId: string;
  currentType: AttendanceEntryType;
  currentOccurredAt: Date;
  onDone: () => void;
}) {
  const router = useRouter();
  const [newType, setNewType] = useState<AttendanceEntryType>(currentType);
  const [newOccurredAt, setNewOccurredAt] = useState(toDateTimeLocalValue(currentOccurredAt));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(undefined);
    if (!reason.trim()) {
      setError("Descreva o motivo da correção.");
      return;
    }
    startTransition(async () => {
      const result = await correctAttendanceEntryAction({
        entryId,
        newType,
        newOccurredAt: new Date(newOccurredAt),
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
    <div className="space-y-2 rounded-md bg-slate-50 p-3">
      <div className="flex flex-wrap gap-2">
        <Select
          value={newType}
          onChange={(e) => setNewType(e.target.value as AttendanceEntryType)}
          className="w-auto"
        >
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {ATTENDANCE_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
        <input
          type="datetime-local"
          value={newOccurredAt}
          onChange={(e) => setNewOccurredAt(e.target.value)}
          className="rounded-md border border-slate-300 px-2 text-sm"
        />
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo da correção (obrigatório)"
        rows={2}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onDone} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="button" onClick={submit} disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar correção"}
        </Button>
      </div>
      <FormBanner message={error} variant="error" />
    </div>
  );
}
