import type { UserRole } from "@/generated/prisma/enums";
import {
  canManageEmployeeLedger,
  canManageFlashDeals,
  canManageProducts,
  canManageRepairOrders,
  canManageSettings,
  canManageStock,
  canSell,
  canViewAllSales,
  canViewAttendancePanel,
  canViewDashboard,
  canViewReports,
  isStockCollaborator,
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
  { label: "Dashboard", href: "/dashboard", available: true, visibleTo: canViewDashboard },
  { label: "PDV", href: "/pdv", available: true, visibleTo: canSell },
  { label: "Caixa", href: "/caixa", available: true, visibleTo: canSell },
  { label: "Vendas", href: "/vendas", available: true, visibleTo: canViewAllSales },
  { label: "Troca", href: "/vendas/buscar", available: true, visibleTo: canSell },
  { label: "Produtos", href: "/produtos", available: true, visibleTo: canManageProducts },
  { label: "Estoque", href: "/estoque", available: true, visibleTo: canManageStock },
  { label: "Ponto", href: "/ponto", available: true },
  {
    label: "Painel de Ponto",
    href: "/ponto/painel",
    available: true,
    visibleTo: canViewAttendancePanel,
  },
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
  { label: "Analytics", href: "/analytics", available: true, visibleTo: canViewReports },
  { label: "Usuários", href: "/usuarios", available: true, visibleTo: canManageSettings },
  {
    label: "Colaboradores",
    href: "/colaboradores",
    available: true,
    visibleTo: canManageEmployeeLedger,
  },
  { label: "Dispositivos", href: "/dispositivos", available: true, visibleTo: canManageSettings },
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
    label: "Oferta Relâmpago",
    href: "/configuracoes/oferta-relampago",
    available: true,
    visibleTo: canManageFlashDeals,
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
    label: "Loja: horário e políticas",
    href: "/configuracoes/loja",
    available: true,
    visibleTo: canManageSettings,
  },
  {
    label: "PDV: impressão",
    href: "/configuracoes/pdv",
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

/** Não é um item da lista geral: esse papel só enxerga essas telas, nunca o resto do painel. */
const STOCK_COLLABORATOR_ITEMS: NavItem[] = [
  { label: "Estoque (fotos)", href: "/colaborador-estoque", available: true },
  { label: "Ponto", href: "/ponto", available: true },
];

export function navItemsForRole(role: UserRole) {
  if (isStockCollaborator(role)) return STOCK_COLLABORATOR_ITEMS;
  return NAV_ITEMS.filter((item) => !item.visibleTo || item.visibleTo(role));
}
