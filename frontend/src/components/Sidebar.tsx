import { FormEvent, useState } from "react";
import { ChevronRight, FolderKanban, Menu, Pencil, Plus, Trash2, X } from "lucide-react";
import clsx from "clsx";

import type { Category, Subbranch } from "../types";
import { useUiStore } from "../store/uiStore";

interface Props {
  categories: Category[];
  subbranches: Subbranch[];
  onCreateCategory: (name: string) => Promise<unknown>;
  onUpdateCategory: (id: number, name: string) => Promise<unknown>;
  onDeleteCategory: (id: number) => Promise<unknown>;
  onCreateSubbranch: (categoryId: number, name: string) => Promise<unknown>;
  onUpdateSubbranch: (id: number, name: string, notes?: string | null) => Promise<unknown>;
  onDeleteSubbranch: (id: number) => Promise<unknown>;
}

export default function Sidebar({
  categories,
  subbranches,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onCreateSubbranch,
  onUpdateSubbranch,
  onDeleteSubbranch
}: Props) {
  const [newCategory, setNewCategory] = useState("");
  const [newSubbranch, setNewSubbranch] = useState("");
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const selectedCategoryId = useUiStore((state) => state.selectedCategoryId);
  const selectedSubbranchId = useUiStore((state) => state.selectedSubbranchId);
  const setSelectedCategoryId = useUiStore((state) => state.setSelectedCategoryId);
  const setSelectedSubbranchId = useUiStore((state) => state.setSelectedSubbranchId);

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newCategory.trim();
    if (!name) return;
    await onCreateCategory(name);
    setNewCategory("");
  }

  async function submitSubbranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newSubbranch.trim();
    if (!name || !selectedCategoryId) return;
    await onCreateSubbranch(selectedCategoryId, name);
    setNewSubbranch("");
  }

  async function renameCategory(category: Category) {
    const next = window.prompt("Rename category", category.name)?.trim();
    if (next && next !== category.name) {
      await onUpdateCategory(category.id, next);
    }
  }

  async function renameSubbranch(subbranch: Subbranch) {
    const next = window.prompt("Rename subbranch", subbranch.name)?.trim();
    if (next && next !== subbranch.name) {
      await onUpdateSubbranch(subbranch.id, next, subbranch.notes);
    }
  }

  const content = (
    <aside className="flex h-full w-80 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-800">
        <button
          className="flex items-center gap-3"
          type="button"
          onClick={() => {
            setSelectedCategoryId(null);
            setSelectedSubbranchId(null);
          }}
        >
          <span className="grid h-10 w-10 place-items-center rounded-md bg-slate-950 text-white dark:bg-white dark:text-slate-950">
            <FolderKanban size={20} />
          </span>
          <span className="text-left">
            <span className="block text-lg font-extrabold text-slate-950 dark:text-white">zenOS</span>
            <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Builder workspace</span>
          </span>
        </button>
        <button className="icon-button lg:hidden" type="button" onClick={() => setSidebarOpen(false)} title="Close menu">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <button
          className={clsx(
            "mb-3 flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-bold transition",
            selectedCategoryId === null
              ? "bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
          )}
          type="button"
          onClick={() => {
            setSelectedCategoryId(null);
            setSelectedSubbranchId(null);
          }}
        >
          All responsibilities
          <ChevronRight size={15} />
        </button>

        <div className="space-y-2">
          {categories.map((category) => {
            const childBranches = subbranches.filter((branch) => branch.category_id === category.id);
            const active = selectedCategoryId === category.id;
            return (
              <div key={category.id} className="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                <div
                  className={clsx(
                    "group flex items-center gap-2 rounded-md px-2 py-2",
                    active && "bg-slate-100 dark:bg-slate-900"
                  )}
                >
                  <button
                    className="min-w-0 flex-1 text-left text-sm font-bold text-slate-800 dark:text-slate-100"
                    type="button"
                    onClick={() => setSelectedCategoryId(category.id)}
                  >
                    {category.name}
                  </button>
                  <button className="icon-button h-7 w-7" type="button" onClick={() => renameCategory(category)} title="Rename category">
                    <Pencil size={14} />
                  </button>
                  <button
                    className="icon-button h-7 w-7"
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete ${category.name}? This also deletes its subbranches and tasks.`)) {
                        void onDeleteCategory(category.id);
                      }
                    }}
                    title="Delete category"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-1 space-y-1 pl-3">
                  {childBranches.map((branch) => (
                    <div key={branch.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategoryId(category.id);
                          setSelectedSubbranchId(branch.id);
                        }}
                        className={clsx(
                          "min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-sm transition",
                          selectedSubbranchId === branch.id
                            ? "bg-sky-50 font-bold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                            : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-900"
                        )}
                      >
                        {branch.name}
                      </button>
                      <button className="icon-button h-7 w-7" type="button" onClick={() => renameSubbranch(branch)} title="Rename subbranch">
                        <Pencil size={13} />
                      </button>
                      <button
                        className="icon-button h-7 w-7"
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete ${branch.name}? Its tasks will be deleted too.`)) {
                            void onDeleteSubbranch(branch.id);
                          }
                        }}
                        title="Delete subbranch"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-200 p-4 dark:border-slate-800">
        <form onSubmit={submitCategory} className="flex gap-2">
          <input
            className="soft-input"
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            placeholder="New category"
          />
          <button className="icon-button border-slate-200 dark:border-slate-700" type="submit" title="Add category">
            <Plus size={17} />
          </button>
        </form>
        <form onSubmit={submitSubbranch} className="flex gap-2">
          <input
            className="soft-input"
            value={newSubbranch}
            onChange={(event) => setNewSubbranch(event.target.value)}
            placeholder="New subbranch"
            disabled={!selectedCategoryId}
          />
          <button className="icon-button border-slate-200 dark:border-slate-700" type="submit" disabled={!selectedCategoryId} title="Add subbranch">
            <Plus size={17} />
          </button>
        </form>
      </div>
    </aside>
  );

  return (
    <>
      <button
        className="fixed left-4 top-4 z-40 icon-button border-slate-200 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-900 lg:hidden"
        type="button"
        onClick={() => setSidebarOpen(true)}
        title="Open menu"
      >
        <Menu size={18} />
      </button>
      <div className="hidden h-screen lg:block">{content}</div>
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-slate-950/40" type="button" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />
          <div className="relative h-full">{content}</div>
        </div>
      )}
    </>
  );
}
