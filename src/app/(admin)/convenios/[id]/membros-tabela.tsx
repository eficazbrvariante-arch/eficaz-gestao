"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FormBanner } from "@/components/ui/form-banner";
import { Textarea } from "@/components/ui/textarea";
import { MoreHorizontal } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import {
  CONVENIO_MEMBER_STATUS_LABELS,
  CONVENIO_MEMBER_STATUSES,
  type ConvenioMemberStatusValue,
} from "@/lib/validations/convenio";
import { updateConvenioMemberStatusAction } from "../actions";

const STATUS_BADGE: Record<ConvenioMemberStatusValue, "success" | "warning" | "danger" | "neutral"> = {
  PENDING: "warning",
  ACTIVE: "success",
  SUSPENDED: "warning",
  BLOCKED: "danger",
  CANCELLED: "neutral",
};

export type ConvenioMemberRow = {
  id: string;
  name: string;
  document: string;
  phone: string | null;
  email: string | null;
  status: ConvenioMemberStatusValue;
  statusReason: string | null;
  selfieUrl: string;
  proofUrl: string | null;
  shortCode: string;
  createdAt: Date;
};

export function MembrosTabela({ members }: { members: ConvenioMemberRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [target, setTarget] = useState<{ member: ConvenioMemberRow; status: ConvenioMemberStatusValue } | null>(
    null
  );
  const [reason, setReason] = useState("");

  function openChange(member: ConvenioMemberRow, status: ConvenioMemberStatusValue) {
    setTarget({ member, status });
    setReason("");
  }

  function confirmChange() {
    if (!target) return;
    setFeedback(undefined);
    startTransition(async () => {
      const result = await updateConvenioMemberStatusAction(target.member.id, {
        status: target.status,
        reason,
      });
      setTarget(null);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setFeedback({ type: "success", message: result?.success ?? "Status atualizado." });
      router.refresh();
    });
  }

  if (members.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
        Nenhum colaborador cadastrado ainda.
      </div>
    );
  }

  return (
    <div>
      <FormBanner message={feedback?.message} variant={feedback?.type} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Colaborador</th>
              <th className="px-4 py-3 font-medium">CPF</th>
              <th className="px-4 py-3 font-medium">Contato</th>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Documentos</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Cadastrado em</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-gray-800">{member.name}</td>
                <td className="px-4 py-3 text-slate-500">{member.document}</td>
                <td className="px-4 py-3 text-slate-500">
                  {member.phone || "-"}
                  {member.email && <div className="text-xs text-slate-400">{member.email}</div>}
                </td>
                <td className="px-4 py-3">
                  <code className="font-mono text-sm tracking-widest text-slate-700">
                    {member.shortCode}
                  </code>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <a
                      href={member.selfieUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-600 hover:underline"
                    >
                      Foto
                    </a>
                    {member.proofUrl ? (
                      <a
                        href={member.proofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-slate-600 hover:underline"
                      >
                        Comprovante
                      </a>
                    ) : (
                      <span className="text-xs text-slate-300">Sem comprovante</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_BADGE[member.status]}>
                    {CONVENIO_MEMBER_STATUS_LABELS[member.status]}
                  </Badge>
                  {member.statusReason && (
                    <div className="mt-1 max-w-[16rem] text-xs text-slate-400">{member.statusReason}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{formatDateTime(member.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <DropdownMenu trigger={<MoreHorizontal className="h-4 w-4" />}>
                    {CONVENIO_MEMBER_STATUSES.filter((status) => status !== member.status).map((status) => (
                      <DropdownMenuItem key={status} onClick={() => openChange(member, status)}>
                        {statusActionLabel(status)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={target !== null}
        onClose={() => setTarget(null)}
        title={target ? `${statusActionLabel(target.status)} — ${target.member.name}` : ""}
        description="O motivo fica registrado no histórico do colaborador."
        footer={
          <>
            <Button variant="secondary" fullWidth={false} onClick={() => setTarget(null)}>
              Cancelar
            </Button>
            <Button variant="brand" fullWidth={false} disabled={isPending} onClick={confirmChange}>
              Confirmar
            </Button>
          </>
        }
      >
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo (opcional)"
          rows={3}
        />
      </Dialog>
    </div>
  );
}

function statusActionLabel(status: ConvenioMemberStatusValue) {
  switch (status) {
    case "ACTIVE":
      return "Aprovar / reativar";
    case "SUSPENDED":
      return "Suspender";
    case "BLOCKED":
      return "Bloquear";
    case "CANCELLED":
      return "Cancelar";
    case "PENDING":
      return "Marcar como pendente";
  }
}
