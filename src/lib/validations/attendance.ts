import { z } from "zod";

const attendanceEntryTypeEnum = z.enum(["CLOCK_IN", "BREAK_START", "BREAK_END", "CLOCK_OUT"]);

export const punchAttendanceSchema = z.object({
  userId: z.string().trim().min(1, "Selecione o colaborador."),
  selfieUrl: z.string().trim().url().optional().or(z.literal("")),
  waived: z.boolean().default(false),
  waiveReason: z.string().trim().optional().or(z.literal("")),
});
export type PunchAttendanceInput = z.infer<typeof punchAttendanceSchema>;

export const correctAttendanceEntrySchema = z.object({
  entryId: z.string().trim().min(1),
  newType: attendanceEntryTypeEnum,
  newOccurredAt: z.coerce.date(),
  reason: z.string().trim().min(3, "Descreva o motivo da correção"),
});
export type CorrectAttendanceEntryInput = z.infer<typeof correctAttendanceEntrySchema>;
export type CorrectAttendanceEntryFormValues = z.input<typeof correctAttendanceEntrySchema>;

export const addMissingAttendanceEntrySchema = z.object({
  userId: z.string().trim().min(1),
  type: attendanceEntryTypeEnum,
  occurredAt: z.coerce.date(),
  reason: z.string().trim().min(3, "Descreva o motivo da marcação adicionada"),
});
export type AddMissingAttendanceEntryInput = z.infer<typeof addMissingAttendanceEntrySchema>;
export type AddMissingAttendanceEntryFormValues = z.input<typeof addMissingAttendanceEntrySchema>;
