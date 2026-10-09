import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, X } from "lucide-react";

import type { Category, Priority, Subbranch, Task, TaskPayload, TaskType } from "../types";

interface Props {
  task?: Task | null;
  categories: Category[];
  subbranches: Subbranch[];
  defaultCategoryId: number | null;
  defaultSubbranchId: number | null;
  onClose: () => void;
  onSubmit: (payload: TaskPayload) => Promise<unknown>;
}

export default function TaskForm({
  task,
  categories,
  subbranches,
  defaultCategoryId,
  defaultSubbranchId,
  onClose,
  onSubmit
}: Props) {
  const initialCategory = task?.category_id ?? defaultCategoryId
    ?? categories.find((category) => subbranches.some((branch) => branch.category_id === category.id))?.id
    ?? categories[0]?.id ?? 0;
  const initialSubbranch = task?.subbranch_id
    ?? subbranches.find((branch) => branch.id === defaultSubbranchId && branch.category_id === initialCategory)?.id
    ?? subbranches.find((branch) => branch.category_id === initialCategory)?.id ?? 0;

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [subbranchId, setSubbranchId] = useState(initialSubbranch);
  const [taskType, setTaskType] = useState<TaskType>(task?.task_type ?? "Daily");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "Medium");
  const [estimatedHours, setEstimatedHours] = useState(task?.estimated_hours ?? 0);
  const [progress, setProgress] = useState(task?.progress ?? 0);
  const [completed, setCompleted] = useState(task?.completed ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const availableBranches = useMemo(
    () => subbranches.filter((branch) => branch.category_id === categoryId),
    [categoryId, subbranches]
  );

  useEffect(() => {
    if (categories.length && !categories.some((category) => category.id === categoryId)) {
      setCategoryId(categories.find((category) => subbranches.some((branch) => branch.category_id === category.id))?.id ?? categories[0].id);
    }
  }, [categories, categoryId, subbranches]);

  useEffect(() => {
    if (!availableBranches.some((branch) => branch.id === subbranchId)) {
      setSubbranchId(availableBranches[0]?.id ?? 0);
    }
  }, [availableBranches, subbranchId]);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    element?.querySelector<HTMLInputElement>("input")?.focus();
    return () => element?.close();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    if (!title.trim()) {
      setError("Give your task a short name.");
      return;
    }
    if (!categoryId || !subbranchId) {
      setError("Choose a folder and a list for this task.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || null,
        category_id: categoryId,
        subbranch_id: subbranchId,
        task_type: taskType,
        due_date: dueDate || null,
        priority,
        estimated_hours: Number(estimatedHours),
        progress: completed ? 100 : Number(progress),
        completed
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your task couldn't be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className="surface m-auto max-h-[92vh] w-[92vw] max-w-xl overflow-y-auto rounded-xl p-0 backdrop:bg-slate-950/50"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <form onSubmit={submit} onInvalid={(event) => {
        const section = (event.target as HTMLElement).closest("details");
        if (section) section.open = true;
      }} className="p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-xl font-bold text-slate-950 dark:text-white">{task ? "Edit task" : "Add a task"}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Give it a name and choose where it belongs.</p>
          </div>
          <button className="icon-button" onClick={onClose} disabled={saving} type="button" aria-label="Close task form">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="md:col-span-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            What needs to be done?
            <input className="soft-input mt-2" placeholder="e.g. Review my notes" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} required autoFocus />
          </label>
          <label className="md:col-span-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Notes <span className="font-normal text-slate-400">(optional)</span>
            <textarea className="soft-input mt-2 min-h-20" placeholder="Anything you want to remember" value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Folder
            <select className="soft-input mt-2" value={categoryId || ""} onChange={(event) => setCategoryId(Number(event.target.value))} required disabled={!categories.length}>
              {!categories.length && <option value="">No folders yet</option>}
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            List
            <select className="soft-input mt-2" value={subbranchId || ""} onChange={(event) => setSubbranchId(Number(event.target.value))} required disabled={!availableBranches.length}>
              {!availableBranches.length && <option value="">No lists in this folder</option>}
              {availableBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          {(!categories.length || !availableBranches.length) && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 md:col-span-2" role="status">
              {!categories.length
                ? "Create a folder first, then add a list inside it. Close this form and choose New folder in My tasks."
                : "This folder has no lists yet. Choose another folder, or close this form and choose New list in My tasks."}
            </p>
          )}
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 md:col-span-2">
            Due date <span className="font-normal text-slate-400">(optional)</span>
            <input className="soft-input mt-2" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
        </div>

        <details className="group mt-5 rounded-lg border border-slate-200 dark:border-slate-700">
          <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
            More options <ChevronDown size={16} className="transition group-open:rotate-180" />
          </summary>
          <div className="grid gap-4 border-t border-slate-200 p-4 dark:border-slate-700 md:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Task or goal
              <select className="soft-input mt-2" value={taskType} onChange={(event) => setTaskType(event.target.value as TaskType)}>
                <option value="Daily">Task</option>
                <option value="Long Term">Longer goal</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Importance
              <select className="soft-input mt-2" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 md:col-span-2">
              Time needed <span className="font-normal text-slate-400">(hours)</span>
              <input className="soft-input mt-2" type="number" min="0" max="500" step="any" value={estimatedHours} onChange={(event) => setEstimatedHours(Number(event.target.value))} />
            </label>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 md:col-span-2">
              How far along? {completed ? 100 : progress}%
              <input className="mt-3 w-full accent-teal-600" type="range" min="0" max="100" value={completed ? 100 : progress} onChange={(event) => setProgress(Number(event.target.value))} disabled={completed} />
            </label>
            <label className="flex items-center gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200 md:col-span-2">
              <input type="checkbox" checked={completed} onChange={(event) => setCompleted(event.target.checked)} className="h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
              This task is done
            </label>
          </div>
        </details>

        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button className="secondary-button" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={saving || !categories.length || !availableBranches.length}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? "Saving…" : task ? "Save changes" : "Add task"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
