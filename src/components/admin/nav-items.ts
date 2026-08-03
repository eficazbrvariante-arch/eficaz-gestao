import type { UserRole } from "@/generated/prisma/enums";
import {
  canManageProducts,
  canManageRepairOrders,
  canManageSettings,
  canManageStock,
  canSell,
  canViewReports,
} from "@/lib/permissions";

export type NavItem = {
  label: string;
  href: string;
  /** Módulos ainda não implementados aparecem marcados como "em breve". */
  available: boolean;
  /** Se ausente, o item é visível para todos os papéis. */
  visibleTo?: (role: UserRole) => boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", available: true },
  { label: "PDV", href: "/pdv", available: true, visibleTo: canSell },
  { label: "Caixa", href: "/caixa", available: true, visibleTo: canSell },
  { label: "Vendas", href: "/vendas", available: true, visibleTo: canSell },
  { label: "Produtos", href: "/produtos", available: true, visibleTo: canManageProducts },
  { label: "Estoque", href: "/estoque", available: true, visibleTo: canManageStock },
  { label: "Clientes", href: "/clientes", available: true },
  { label: "Fornecedores", href: "/fornecedores", available: true, visibleTo: canManageProducts },
  { label: "Pedidos online", href: "/pedidos", available: true, visibleTo: canSell },
  {
    label: "Assistência Técnica",
    href: "/assistencia-tecnica",
    available: true,
    visibleTo: canManageRepairOrders,
  },
  { label: "Relatórios", href: "/relatorios", available: true, visibleTo: canViewReports },
  { label: "Usuários", href: "/usuarios", available: true, visibleTo: canManageSettings },
  {
    label: "Plano e uso",
    href: "/configuracoes/plano",
    available: true,
    visibleTo: canManageSettings,
  },
  {
    label: "Catálogo online",
    href: "/configuracoes/catalogo",
    available: true,
    visibleTo: canManageSettings,
  },
  {
    label: "Entrega e retirada",
    href: "/configuracoes/entrega",
    available: true,
    visibleTo: canManageSettings,
  },
  {
    label: "Domínio próprio",
    href: "/configuracoes/dominio",
    available: true,
    visibleTo: canManageSettings,
  },
  {
    label: "Configurações da empresa",
    href: "/configuracoes/empresa",
    available: true,
    visibleTo: canManageSettings,
  },
];

export function navItemsForRole(role: UserRole) {
  return NAV_ITEMS.filter((item) => !item.visibleTo || item.visibleTo(role));
}
