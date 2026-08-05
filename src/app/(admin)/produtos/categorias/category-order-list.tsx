"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { clsx } from "@/lib/clsx";
import { updateCategoryOrderAction, deleteCategoryAction } from "../actions";
import { CategoryEditForm } from "./category-edit-form";

type CategoryRow = {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  icon: string | null;
  productCount: number;
};

export function CategoryOrderList({
  categories,
  allCategories,
}: {
  categories: CategoryRow[];
  allCategories: { id: string; name: string }[];
}) {
  const [items, setItems] = useState(categories);
  const [isPending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function persist(next: CategoryRow[]) {
    setItems(next);
    startTransition(() => {
      updateCategoryOrderAction(next.map((item) => item.id));
    });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    persist(arrayMove(items, index, target));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    persist(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-slate-500">
          <tr>
            <th className="w-20 px-4 py-3 font-medium">Ordem</th>
            <th className="px-4 py-3 font-medium">Nome</th>
            <th className="px-4 py-3 font-medium">Categoria pai</th>
            <th className="px-4 py-3 font-medium">Produtos</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            <tbody>
              {items.map((category, index) => (
                <CategoryRowItem
                  key={category.id}
                  category={category}
                  allCategories={allCategories}
                  isFirst={index === 0}
                  isLast={index === items.length - 1}
                  onMoveUp={() => move(index, -1)}
                  onMoveDown={() => move(index, 1)}
                />
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Nenhuma categoria cadastrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </SortableContext>
        </DndContext>
      </table>
      {isPending && (
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">Salvando ordem…</p>
      )}
    </div>
  );
}

function CategoryRowItem({
  category,
  allCategories,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: {
  category: CategoryRow;
  allCategories: { id: string; name: string }[];
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (isEditing) {
    return (
      <tr ref={setNodeRef} style={style} className="border-b border-slate-100 bg-slate-50 last:border-0">
        <td colSpan={5} className="px-4 py-3">
          <CategoryEditForm
            category={category}
            categories={allCategories.filter((c) => c.id !== category.id)}
            onDone={() => setIsEditing(false)}
          />
        </td>
      </tr>
    );
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={clsx(
        "border-b border-slate-100 bg-white last:border-0",
        isDragging && "relative z-10 shadow-md"
      )}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 text-slate-400">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab rounded p-1 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
            aria-label={`Arrastar para reordenar ${category.name}`}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <circle cx="7" cy="5" r="1.2" />
              <circle cx="13" cy="5" r="1.2" />
              <circle cx="7" cy="10" r="1.2" />
              <circle cx="13" cy="10" r="1.2" />
              <circle cx="7" cy="15" r="1.2" />
              <circle cx="13" cy="15" r="1.2" />
            </svg>
          </button>
          <div className="flex flex-col">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={isFirst}
              className="rounded px-1 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-25"
              aria-label={`Subir ${category.name}`}
            >
              ▲
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={isLast}
              className="rounded px-1 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-25"
              aria-label={`Descer ${category.name}`}
            >
              ▼
            </button>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-slate-900">{category.name}</td>
      <td className="px-4 py-3 text-slate-500">{category.parentName ?? "-"}</td>
      <td className="px-4 py-3 text-slate-500">{category.productCount}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-sm text-slate-600 hover:underline"
          >
            Editar
          </button>
          <form action={deleteCategoryAction.bind(null, category.id)}>
            <button
              type="submit"
              className="text-sm text-red-600 hover:underline"
              disabled={category.productCount > 0}
              title={
                category.productCount > 0
                  ? "Remova os produtos desta categoria antes de excluir"
                  : undefined
              }
            >
              Excluir
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}
