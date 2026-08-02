import { logoutAction } from "@/app/(admin)/actions";
import { ROLE_LABELS } from "@/lib/permissions";
import { MobileMenuButton } from "@/components/admin/mobile-menu-button";
import type { UserRole } from "@/generated/prisma/enums";

export function Topbar({ name, role }: { name: string; role: UserRole }) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <div className="flex items-center text-sm text-slate-500">
        <MobileMenuButton />
        Bem-vindo(a), <span className="font-medium text-slate-900">{name}</span>{" "}
        <span className="text-xs text-slate-400">({ROLE_LABELS[role] ?? role})</span>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Sair
        </button>
      </form>
    </header>
  );
}
