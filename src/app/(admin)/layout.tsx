import { requireUser } from "@/lib/session";
import { Sidebar } from "@/components/admin/sidebar";
import { Topbar } from "@/components/admin/topbar";
import { MobileSidebarProvider } from "@/components/admin/mobile-sidebar-context";
import { ToastProvider } from "@/components/ui/toast";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    // `.eficaz-admin` precisa envolver TUDO (inclusive os providers), não só
    // a div visual — o Toast e o portal do DropdownMenu (ver
    // `#eficaz-admin-portal-root` abaixo) também precisam herdar os tokens
    // escuros daqui, e não são filhos diretos da div visual.
    <div className="eficaz-admin">
      <MobileSidebarProvider>
        <ToastProvider>
          <div className="flex min-h-screen bg-background text-foreground">
            <Sidebar role={user.role} />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar name={user.name ?? user.email ?? "Usuário"} role={user.role} />
              <main className="min-w-0 flex-1 p-6 print:p-0">{children}</main>
            </div>
          </div>
          {/* Alvo do createPortal do DropdownMenu — precisa estar dentro de
              `.eficaz-admin` pra herdar os tokens; `document.body` fica fora
              desse escopo (compartilhado com a loja pública). */}
          <div id="eficaz-admin-portal-root" />
        </ToastProvider>
      </MobileSidebarProvider>
    </div>
  );
}
