import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckSquare,
  FolderPlus,
  ListPlus,
  X,
} from "lucide-react";
import type { Category } from "../types";

export function PersonalDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>("input")?.focus();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="personal-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[90vh] w-[calc(100%-32px)] max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/40 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 id="personal-dialog-title" className="text-xl font-bold">
          {title}
        </h2>
        <button
          type="button"
          className="icon-button shrink-0"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function PersonalHelp({ onClose }: { onClose: () => void }) {
  return (
    <PersonalDialog
      title="A little structure. A clearer day."
      onClose={onClose}
    >
      <p className="mb-6 text-sm leading-6 text-slate-500">
        This is your private place to keep track of things. Start with three
        simple steps.
      </p>
      <div className="space-y-5">
        {[
          {
            icon: FolderPlus,
            title: "1. Create a folder",
            text: "Choose a broad area of your life or work. You choose the name.",
          },
          {
            icon: ListPlus,
            title: "2. Add a list inside it",
            text: "Use lists to break a folder into smaller projects or topics.",
          },
          {
            icon: CheckSquare,
            title: "3. Add a task",
            text: "Write what needs to be done. Add notes or a due date if you need them, then tick it off when finished.",
          },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex items-start gap-3">
            <span className="rounded-xl bg-teal-50 p-3 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
              <Icon size={20} />
            </span>
            <div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">{text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <b>Find your work:</b> choose a folder or list from the menu.{" "}
        <b>All tasks</b> shows unfinished tasks, <b>Today</b> highlights urgent
        work, and <b>Done</b> keeps what you’ve finished. Your personal tasks
        are visible only to you.
      </div>
      <button
        type="button"
        className="primary-button mt-6 w-full"
        onClick={onClose}
      >
        Got it
        <Check size={17} />
      </button>
    </PersonalDialog>
  );
}

export default function PersonalOrganizer({
  kind,
  categories,
  initialCategoryId,
  onCreate,
  onClose,
}: {
  kind: "folder" | "list";
  categories: Category[];
  initialCategoryId: number | null;
  onCreate: (name: string, categoryId?: number) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(
    initialCategoryId ?? categories[0]?.id ?? 0,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const folder = kind === "folder";
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || (!folder && !categoryId) || busy) return;
    setError("");
    setBusy(true);
    try {
      await onCreate(name.trim(), folder ? undefined : categoryId);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't create this. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <PersonalDialog
      title={folder ? "Create a folder" : "Create a list"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit} className="space-y-5">
        <p className="text-sm leading-6 text-slate-500">
          {folder
            ? "A folder is a broad area you want to organize. You can add lists and tasks inside it."
            : "A list brings related tasks together. Choose the folder it belongs to."}
        </p>
        {!folder && (
          <label className="block text-sm font-semibold">
            In folder
            <select
              className="soft-input mt-2"
              value={categoryId}
              onChange={(e) => setCategoryId(Number(e.target.value))}
              required
              disabled={busy}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-sm font-semibold">
          {folder ? "Folder name" : "List name"}
          <input
            className="soft-input mt-2"
            autoFocus
            required
            maxLength={folder ? 120 : 140}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              folder ? "Give your folder a name" : "Give your list a name"
            }
            disabled={busy}
          />
        </label>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="primary-button" disabled={busy || !name.trim()}>
            {busy ? "Creating…" : folder ? "Create folder" : "Create list"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </PersonalDialog>
  );
}
