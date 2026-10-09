import { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  CircleHelp,
  Folder,
  FolderPlus,
  ListPlus,
  Menu,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import clsx from "clsx";
import type { Category, Subbranch } from "../types";
import { useUiStore } from "../store/uiStore";

interface Props {
  categories: Category[];
  subbranches: Subbranch[];
  onAddFolder: () => void;
  onAddList: (categoryId?: number) => void;
  onShowHelp: () => void;
  onUpdateCategory: (id: number, name: string) => Promise<unknown>;
  onDeleteCategory: (id: number) => Promise<unknown>;
  onUpdateSubbranch: (
    id: number,
    name: string,
    notes?: string | null,
  ) => Promise<unknown>;
  onDeleteSubbranch: (id: number) => Promise<unknown>;
}

export default function Sidebar({
  categories,
  subbranches,
  onAddFolder,
  onAddList,
  onShowHelp,
  onUpdateCategory,
  onDeleteCategory,
  onUpdateSubbranch,
  onDeleteSubbranch,
}: Props) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const selectedCategoryId = useUiStore((state) => state.selectedCategoryId);
  const selectedSubbranchId = useUiStore((state) => state.selectedSubbranchId);
  const setSelectedCategoryId = useUiStore(
    (state) => state.setSelectedCategoryId,
  );
  const setSelectedSubbranchId = useUiStore(
    (state) => state.setSelectedSubbranchId,
  );
  useEffect(() => {
    if (!sidebarOpen) return;
    const dialog = drawer.current;
    dialog?.showModal();
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setSidebarOpen(false);
    };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      dialog?.close();
      desktop.removeEventListener("change", closeOnDesktop);
    };
  }, [sidebarOpen, setSidebarOpen]);

  async function manage(action: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't save that change. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function chooseFolder(id: number | null) {
    setSelectedCategoryId(id);
    setSidebarOpen(false);
  }

  const content = (
    <aside
      className="flex h-full w-72 max-w-[calc(100vw-32px)] flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
      aria-label="Personal folders"
    >
      <div className="flex items-center justify-between px-5 py-5">
        <button
          className="flex items-center gap-3"
          type="button"
          onClick={() => chooseFolder(null)}
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
            <Folder size={21} />
          </span>
          <span className="text-left">
            <span className="block text-lg font-extrabold text-slate-950 dark:text-white">
              zenOS
            </span>
            <span className="block text-xs text-slate-500">
              Personal workspace
            </span>
          </span>
        </button>
        <button
          className="icon-button lg:hidden"
          type="button"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close folders"
        >
          <X size={18} />
        </button>
      </div>
      <div className="space-y-2 border-b border-slate-100 px-4 pb-5 dark:border-slate-800">
        <button
          className="primary-button w-full"
          type="button"
          onClick={onAddFolder}
        >
          <FolderPlus size={17} />
          New folder
        </button>
        <button
          className="secondary-button w-full"
          type="button"
          onClick={() => onAddList(selectedCategoryId ?? undefined)}
        >
          <ListPlus size={17} />
          New list
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <button
          className={clsx(
            "mb-5 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-semibold",
            selectedCategoryId === null
              ? "bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
              : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900",
          )}
          type="button"
          onClick={() => chooseFolder(null)}
        >
          All my tasks
          <ChevronRight size={15} />
        </button>
        <p className="mb-3 px-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          My folders
        </p>
        {error && (
          <p
            role="alert"
            className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200"
          >
            {error}
          </p>
        )}
        {!categories.length && (
          <div className="rounded-xl border border-dashed border-slate-200 p-4 dark:border-slate-700">
            <p className="text-sm font-semibold">A place for your plans</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Create a folder above, then add lists to organize your tasks.
            </p>
          </div>
        )}
        <div className="space-y-3">
          {categories.map((category) => {
            const branches = subbranches.filter(
              (branch) => branch.category_id === category.id,
            );
            return (
              <div
                key={category.id}
                className="rounded-xl border border-slate-200 p-2 dark:border-slate-800"
              >
                <div
                  className={clsx(
                    "flex items-center gap-1 rounded-lg px-2 py-2",
                    selectedCategoryId === category.id &&
                      "bg-slate-100 dark:bg-slate-900",
                  )}
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 break-words text-left text-sm font-semibold"
                    type="button"
                    onClick={() => chooseFolder(category.id)}
                  >
                    <Folder size={15} className="shrink-0 text-slate-400" />
                    {category.name}
                  </button>
                  <button
                    className="icon-button h-7 w-7 shrink-0"
                    disabled={busy}
                    type="button"
                    aria-label={`Rename folder ${category.name}`}
                    onClick={() => {
                      const name = window
                        .prompt("Rename folder", category.name)
                        ?.trim();
                      if (name && name !== category.name)
                        void manage(() => onUpdateCategory(category.id, name));
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="icon-button h-7 w-7 shrink-0"
                    disabled={busy}
                    type="button"
                    aria-label={`Delete folder ${category.name}`}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete ${category.name}? Its lists and tasks will also be permanently deleted.`,
                        )
                      )
                        void manage(() => onDeleteCategory(category.id));
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="mt-1 space-y-1 pl-3">
                  {branches.map((branch) => (
                    <div key={branch.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        className={clsx(
                          "min-w-0 flex-1 break-words rounded-lg px-2 py-2 text-left text-sm",
                          selectedSubbranchId === branch.id
                            ? "bg-teal-50 font-semibold text-teal-800 dark:bg-teal-950 dark:text-teal-200"
                            : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900",
                        )}
                        onClick={() => {
                          setSelectedCategoryId(category.id);
                          setSelectedSubbranchId(branch.id);
                          setSidebarOpen(false);
                        }}
                      >
                        {branch.name}
                      </button>
                      <button
                        className="icon-button h-7 w-7 shrink-0"
                        disabled={busy}
                        type="button"
                        aria-label={`Rename list ${branch.name}`}
                        onClick={() => {
                          const name = window
                            .prompt("Rename list", branch.name)
                            ?.trim();
                          if (name && name !== branch.name)
                            void manage(() =>
                              onUpdateSubbranch(branch.id, name, branch.notes),
                            );
                        }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className="icon-button h-7 w-7 shrink-0"
                        disabled={busy}
                        type="button"
                        aria-label={`Delete list ${branch.name}`}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete ${branch.name}? Its tasks will also be permanently deleted.`,
                            )
                          )
                            void manage(() => onDeleteSubbranch(branch.id));
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950"
                    type="button"
                    aria-label={`Add a list to ${category.name}`}
                    onClick={() => onAddList(category.id)}
                  >
                    <Plus size={14} />
                    Add a list
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <button
        className="flex shrink-0 items-center gap-3 border-t border-slate-100 px-5 py-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
        type="button"
        onClick={onShowHelp}
      >
        <CircleHelp size={18} />
        How to use this
      </button>
    </aside>
  );
  return (
    <>
      <button
        className="icon-button fixed left-4 top-4 z-40 border-slate-200 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-900 lg:hidden"
        type="button"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open folders"
      >
        <Menu size={18} />
      </button>
      <div className="sticky top-0 hidden h-screen shrink-0 lg:block">
        {content}
      </div>
      {sidebarOpen && (
        <dialog
          ref={drawer}
          aria-label="Your folders"
          className="m-0 h-dvh max-h-none w-72 max-w-[calc(100vw_-_32px)] border-0 p-0 backdrop:bg-slate-950/40 lg:hidden"
          onCancel={(event) => {
            event.preventDefault();
            setSidebarOpen(false);
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) setSidebarOpen(false);
          }}
        >
          {content}
        </dialog>
      )}
    </>
  );
}
