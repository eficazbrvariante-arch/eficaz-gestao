import { logoutAction } from "@/app/(admin)/actions";
import { ROLE_LABELS } from "@/lib/permissions";
import { MobileMenuButton } from "@/components/admin/mobile-menu-button";
import type { UserRole } from "@/generated/prisma/enums";

export function Topbar({ name, role }: { name: string; role: UserRole }) {
  return (
    <header className="flex items-center justify-between border-b border-border bg-sidebar px-6 py-3 print:hidden">
      <div className="flex items-center text-sm text-text-muted">
        <MobileMenuButton />
        Bem-vindo(a), <span className="font-medium text-foreground">{name}</span>{" "}
        <span className="text-xs text-text-muted">({ROLE_LABELS[role] ?? role})</span>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover"
        >
          Sair
        </button>
      </form>
    </header>
  );
}
