"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Copy,
  ExternalLink,
  ImageOff,
  MoreHorizontal,
  Pencil,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuItem, dropdownItemClassName } from "@/components/ui/dropdown-menu";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { clsx } from "@/lib/clsx";
import { formatBRL } from "@/lib/format";
import { isLowStock, isOutOfStock } from "@/modules/products/stock-status";
import type { ProductListItem, ProductSort, SortDir } from "@/modules/products/product-list-query";
import {
  bulkDeleteProductsAction,
  bulkUpdateProductsAction,
  deleteProductAction,
  duplicateProductAction,
  toggleProductActiveAction,
} from "./actions";

type ActionResult = { error?: string; success?: string } | void;

function ProductThumbnail({ url, alt }: { url?: string; alt: string }) {
  if (!url) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400">
        <ImageOff className="h-5 w-5" />
      </div>
    );
  }
  return (
    <Image
      src={url}
      alt={alt}
      width={48}
      height={48}
      className="h-12 w-12 shrink-0 rounded-md border border-slate-200 object-cover"
    />
  );
}

function StockBadge({ product }: { product: ProductListItem }) {
  if (isOutOfStock(product)) {
    return <Badge variant="danger">Sem estoque</Badge>;
  }
  if (isLowStock(product)) {
    return <Badge variant="warning">Estoque baixo</Badge>;
  }
  return <Badge variant="success">Em estoque</Badge>;
}

function SortHeader({
  field,
  label,
  sort,
  dir,
  onSort,
}: {
  field: ProductSort;
  label: string;
  sort: ProductSort;
  dir: SortDir;
  onSort: (field: ProductSort) => void;
}) {
  const active = sort === field;
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={clsx(
        "inline-flex items-center gap-1 font-medium hover:text-gray-800",
        active ? "text-gray-800" : "text-slate-500"
      )}
    >
      {label}
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

export function ProdutosTabela({
  items,
  sort,
  dir,
  storeSubdomain,
  categories,
  brands,
}: {
  items: ProductListItem[];
  sort: ProductSort;
  dir: SortDir;
  storeSubdomain: string | null;
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showToast = useToast();
  const [isPending, startTransition] = useTransition();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ProductListItem | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkField, setBulkField] = useState<"category" | "brand" | null>(null);
  const [bulkValue, setBulkValue] = useState("");
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // Reseta a seleção quando os dados mudam (nova página, novo filtro, refresh
  // pós-ação) — ajuste durante a renderização, não em efeito, pra não causar
  // um re-render em cascata só pra limpar a seleção.
  const [selectionItems, setSelectionItems] = useState(items);
  if (items !== selectionItems) {
    setSelectionItems(items);
    setSelected(new Set());
  }

  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));
  const someSelected = selected.size > 0 && !allSelected;

  useEffect(() => {
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = someSelected;
  }, [someSelected]);

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)));
  }

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runAction(action: () => Promise<ActionResult>, fallbackSuccess: string, onDone?: () => void) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result && "error" in result && result.error) {
          showToast(result.error, "error");
          return;
        }
        const message = (result && "success" in result && result.success) || fallbackSuccess;
        showToast(message, "success");
        onDone?.();
        router.refresh();
      } catch {
        showToast("Não foi possível concluir a ação. Tente novamente.", "error");
      }
    });
  }

  function handleSort(field: ProductSort) {
    const params = new URLSearchParams(searchParams.toString());
    if (sort === field) {
      params.set("dir", dir === "asc" ? "desc" : "asc");
    } else {
      params.set("sort", field);
      params.set("dir", "asc");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    runAction(
      async () => {
        await deleteProductAction(id);
      },
      "Produto excluído com sucesso.",
      () => setDeleteTarget(null)
    );
  }

  function confirmBulkDeleteAction() {
    const ids = [...selected];
    runAction(
      () => bulkDeleteProductsAction(ids),
      "Produtos excluídos com sucesso.",
      () => setConfirmBulkDelete(false)
    );
  }

  function confirmBulkFieldChange() {
    const ids = [...selected];
    const field = bulkField;
    if (!field) return;
    runAction(
      () =>
        bulkUpdateProductsAction(
          ids,
          field === "category" ? { categoryId: bulkValue || null } : { brandId: bulkValue || null }
        ),
      "Produtos atualizados com sucesso.",
      () => {
        setBulkField(null);
        setBulkValue("");
      }
    );
  }

  if (items.length === 0) {
    const hasFilters = Boolean(
      searchParams.get("q") ||
        searchParams.get("category") ||
        searchParams.get("brand") ||
        (searchParams.get("status") && searchParams.get("status") !== "all") ||
        (searchParams.get("stock") && searchParams.get("stock") !== "all")
    );
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-medium text-gray-800">Nenhum produto encontrado.</p>
        <p className="mt-1 text-sm text-slate-500">
          {hasFilters
            ? "Tente alterar os filtros ou o termo pesquisado."
            : "Cadastre seu primeiro produto pra começar."}
        </p>
      </div>
    );
  }

  return (
    <div className="pb-16">
      {/* Desktop */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <Checkbox ref={headerCheckboxRef} checked={allSelected} onChange={toggleAll} aria-label="Selecionar todos" />
              </th>
              <th className="px-2 py-3" />
              <th className="px-2 py-3">
                <SortHeader field="name" label="Produto" sort={sort} dir={dir} onSort={handleSort} />
              </th>
              <th className="px-4 py-3 font-medium">Categoria</th>
              <th className="px-4 py-3 font-medium">Marca</th>
              <th className="px-2 py-3">
                <SortHeader field="price" label="Preço" sort={sort} dir={dir} onSort={handleSort} />
              </th>
              <th className="px-2 py-3">
                <SortHeader field="stock" label="Estoque" sort={sort} dir={dir} onSort={handleSort} />
              </th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((product) => {
              const storeHref = storeSubdomain ? `/loja/${storeSubdomain}/produto/${product.id}` : undefined;
              const blockedByHistory = product._count.saleItems > 0;
              return (
                <tr key={product.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Checkbox
                      checked={selected.has(product.id)}
                      onChange={() => toggleOne(product.id)}
                      aria-label={`Selecionar ${product.name}`}
                    />
                  </td>
                  <td className="px-2 py-3">
                    <ProductThumbnail url={product.images[0]?.url} alt={product.name} />
                  </td>
                  <td className="px-2 py-3">
                    <div className="font-medium text-gray-800">{product.name}</div>
                    <div className="text-xs text-slate-400">
                      {product.internalCode || product.barcode || "sem código"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{product.category?.name ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-500">{product.brand?.name ?? "-"}</td>
                  <td className="px-2 py-3 text-gray-800">
                    {formatBRL(product.salePrice)}
                    {product.promoPrice && (
                      <div className="text-xs text-emerald-600">Promo: {formatBRL(product.promoPrice)}</div>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    <div className="text-gray-800">{product.stockQty}</div>
                    <StockBadge product={product} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={product.active ? "success" : "neutral"}>
                      {product.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu trigger={<MoreHorizontal className="h-4 w-4" />}>
                      <Link href={`/produtos/${product.id}`} className={dropdownItemClassName()}>
                        <Pencil className="h-4 w-4" /> Editar
                      </Link>
                      <DropdownMenuItem
                        onClick={() =>
                          runAction(() => duplicateProductAction(product.id), "Produto duplicado com sucesso.")
                        }
                      >
                        <Copy className="h-4 w-4" /> Duplicar
                      </DropdownMenuItem>
                      {storeHref ? (
                        <a
                          href={storeHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={dropdownItemClassName()}
                        >
                          <ExternalLink className="h-4 w-4" /> Visualizar na loja
                        </a>
                      ) : null}
                      <DropdownMenuItem
                        onClick={() =>
                          runAction(
                            () => toggleProductActiveAction(product.id, !product.active),
                            product.active ? "Produto desativado." : "Produto ativado."
                          )
                        }
                      >
                        {product.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                        {product.active ? "Desativar" : "Ativar"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        danger
                        disabled={blockedByHistory}
                        onClick={() => setDeleteTarget(product)}
                        title={
                          blockedByHistory
                            ? "Produtos com vendas registradas não podem ser excluídos. Desative o produto para removê-lo do PDV e do catálogo."
                            : undefined
                        }
                      >
                        <Trash2 className="h-4 w-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="flex flex-col gap-3 md:hidden">
        {items.map((product) => {
          const storeHref = storeSubdomain ? `/loja/${storeSubdomain}/produto/${product.id}` : undefined;
          const blockedByHistory = product._count.saleItems > 0;
          return (
            <div key={product.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selected.has(product.id)}
                  onChange={() => toggleOne(product.id)}
                  aria-label={`Selecionar ${product.name}`}
                  className="mt-1"
                />
                <ProductThumbnail url={product.images[0]?.url} alt={product.name} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-800">{product.name}</div>
                  <div className="text-xs text-slate-400">
                    {product.internalCode || product.barcode || "sem código"}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">{formatBRL(product.salePrice)}</span>
                    <Badge variant={product.active ? "success" : "neutral"}>
                      {product.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                    <span>Estoque: {product.stockQty}</span>
                    <StockBadge product={product} />
                  </div>
                </div>
                <DropdownMenu trigger={<MoreHorizontal className="h-4 w-4" />}>
                  <Link href={`/produtos/${product.id}`} className={dropdownItemClassName()}>
                    <Pencil className="h-4 w-4" /> Editar
                  </Link>
                  <DropdownMenuItem
                    onClick={() =>
                      runAction(() => duplicateProductAction(product.id), "Produto duplicado com sucesso.")
                    }
                  >
                    <Copy className="h-4 w-4" /> Duplicar
                  </DropdownMenuItem>
                  {storeHref ? (
                    <a href={storeHref} target="_blank" rel="noopener noreferrer" className={dropdownItemClassName()}>
                      <ExternalLink className="h-4 w-4" /> Visualizar na loja
                    </a>
                  ) : null}
                  <DropdownMenuItem
                    onClick={() =>
                      runAction(
                        () => toggleProductActiveAction(product.id, !product.active),
                        product.active ? "Produto desativado." : "Produto ativado."
                      )
                    }
                  >
                    {product.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                    {product.active ? "Desativar" : "Ativar"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    danger
                    disabled={blockedByHistory}
                    onClick={() => setDeleteTarget(product)}
                  >
                    <Trash2 className="h-4 w-4" /> Excluir
                  </DropdownMenuItem>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>

      {/* Barra de ações em massa */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:sticky sm:mt-4 sm:rounded-xl sm:border sm:shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 text-sm font-medium text-gray-800">{selected.size} selecionado(s)</span>
            <Button
              variant="secondary"
              fullWidth={false}
              disabled={isPending}
              onClick={() => runAction(() => bulkUpdateProductsAction([...selected], { active: true }), "Produtos ativados.")}
            >
              Ativar
            </Button>
            <Button
              variant="secondary"
              fullWidth={false}
              disabled={isPending}
              onClick={() => runAction(() => bulkUpdateProductsAction([...selected], { active: false }), "Produtos desativados.")}
            >
              Desativar
            </Button>
            <Button variant="secondary" fullWidth={false} disabled={isPending} onClick={() => setBulkField("category")}>
              Alterar categoria
            </Button>
            <Button variant="secondary" fullWidth={false} disabled={isPending} onClick={() => setBulkField("brand")}>
              Alterar marca
            </Button>
            <Button variant="danger" fullWidth={false} disabled={isPending} onClick={() => setConfirmBulkDelete(true)}>
              Excluir
            </Button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="ml-auto text-sm text-slate-500 hover:text-slate-700"
            >
              Limpar seleção
            </button>
          </div>
        </div>
      )}

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Excluir produto"
        description={`Tem certeza que deseja excluir "${deleteTarget?.name ?? ""}"? Essa ação não pode ser desfeita.`}
        footer={
          <>
            <Button variant="secondary" fullWidth={false} onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="danger" fullWidth={false} disabled={isPending} onClick={confirmDelete}>
              Excluir
            </Button>
          </>
        }
      />

      <Dialog
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        title="Excluir produtos selecionados"
        description={`Tem certeza que deseja excluir ${selected.size} produto(s)? Produtos com vendas registradas não serão excluídos, apenas mantidos. Essa ação não pode ser desfeita.`}
        footer={
          <>
            <Button variant="secondary" fullWidth={false} onClick={() => setConfirmBulkDelete(false)}>
              Cancelar
            </Button>
            <Button variant="danger" fullWidth={false} disabled={isPending} onClick={confirmBulkDeleteAction}>
              Excluir
            </Button>
          </>
        }
      />

      <Dialog
        open={bulkField !== null}
        onClose={() => {
          setBulkField(null);
          setBulkValue("");
        }}
        title={bulkField === "category" ? "Alterar categoria" : "Alterar marca"}
        description={`Aplicar a ${selected.size} produto(s) selecionado(s).`}
        footer={
          <>
            <Button
              variant="secondary"
              fullWidth={false}
              onClick={() => {
                setBulkField(null);
                setBulkValue("");
              }}
            >
              Cancelar
            </Button>
            <Button variant="brand" fullWidth={false} disabled={isPending} onClick={confirmBulkFieldChange}>
              Aplicar
            </Button>
          </>
        }
      >
        <Select value={bulkValue} onChange={(event) => setBulkValue(event.target.value)}>
          <option value="">Nenhuma</option>
          {(bulkField === "category" ? categories : brands).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </Dialog>
    </div>
  );
}
