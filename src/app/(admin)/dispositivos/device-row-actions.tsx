"use client";

import { useState, useTransition } from "react";
import { approveDeviceAction, rejectDeviceAction, revokeDeviceAction } from "./actions";
import type { DeviceStatus } from "@/generated/prisma/enums";

export function DeviceRowActions({
  deviceId,
  status,
  isCurrentDevice,
}: {
  deviceId: string;
  status: DeviceStatus;
  isCurrentDevice: boolean;
}) {
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  function run(action: (id: string) => Promise<{ error?: string; success?: string }>) {
    setError(undefined);
    startTransition(async () => {
      const result = await action(deviceId);
      if (result?.error) setError(result.error);
    });
  }

  if (isCurrentDevice) {
    return <span className="text-xs text-slate-400">Dispositivo atual</span>;
  }

  return (
    <div className="space-y-1 text-right">
      <div className="flex flex-wrap justify-end gap-2">
        {status !== "APPROVED" && (
          <button
            type="button"
            onClick={() => run(approveDeviceAction)}
            disabled={isPending}
            className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50"
          >
            Aprovar
          </button>
        )}
        {status !== "REJECTED" && (
          <button
            type="button"
            onClick={() => run(rejectDeviceAction)}
            disabled={isPending}
            className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            Recusar
          </button>
        )}
        {status === "APPROVED" && (
          <button
            type="button"
            onClick={() => run(revokeDeviceAction)}
            disabled={isPending}
            className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            Revogar
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
