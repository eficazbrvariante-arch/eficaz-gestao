import { requireUser } from "@/lib/session";
import { Sidebar } from "@/components/admin/sidebar";
import { Topbar } from "@/components/admin/topbar";
import { MobileSidebarProvider } from "@/components/admin/mobile-sidebar-context";
import { ToastProvider } from "@/components/ui/toast";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <MobileSidebarProvider>
      <ToastProvider>
        <div className="flex min-h-screen bg-slate-50">
          <Sidebar role={user.role} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar name={user.name ?? user.email ?? "Usuário"} role={user.role} />
            <main className="min-w-0 flex-1 p-6 print:p-0">{children}</main>
          </div>
        </div>
      </ToastProvider>
    </MobileSidebarProvider>
  );
}
