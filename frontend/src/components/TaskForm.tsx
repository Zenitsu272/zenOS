import { FormEvent, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

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
  const initialCategory = task?.category_id ?? defaultCategoryId ?? categories[0]?.id ?? 0;
  const initialSubbranch = task?.subbranch_id ?? defaultSubbranchId ?? subbranches.find((branch) => branch.category_id === initialCategory)?.id ?? 0;

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [subbranchId, setSubbranchId] = useState(initialSubbranch);
  const [taskType, setTaskType] = useState<TaskType>(task?.task_type ?? "Daily");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "Medium");
  const [estimatedHours, setEstimatedHours] = useState(task?.estimated_hours ?? 1);
  const [progress, setProgress] = useState(task?.progress ?? 0);
  const [completed, setCompleted] = useState(task?.completed ?? false);
  const [saving, setSaving] = useState(false);

  const availableBranches = useMemo(
    () => subbranches.filter((branch) => branch.category_id === categoryId),
    [categoryId, subbranches]
  );

  useEffect(() => {
    if (!availableBranches.some((branch) => branch.id === subbranchId)) {
      setSubbranchId(availableBranches[0]?.id ?? 0);
    }
  }, [availableBranches, subbranchId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryId || !subbranchId) return;
    setSaving(true);
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
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 px-4 py-6">
      <form onSubmit={submit} className="surface max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg p-5">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-slate-950 dark:text-white">{task ? "Edit task" : "New task"}</h2>
          <button className="icon-button" onClick={onClose} type="button" title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="md:col-span-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Title
            <input className="soft-input mt-2" value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label className="md:col-span-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Description
            <textarea className="soft-input mt-2 min-h-24" value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Category
            <select className="soft-input mt-2" value={categoryId} onChange={(event) => setCategoryId(Number(event.target.value))}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Subbranch
            <select className="soft-input mt-2" value={subbranchId} onChange={(event) => setSubbranchId(Number(event.target.value))}>
              {availableBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Type
            <select className="soft-input mt-2" value={taskType} onChange={(event) => setTaskType(event.target.value as TaskType)}>
              <option>Daily</option>
              <option>Long Term</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Due date
            <input className="soft-input mt-2" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Priority
            <select className="soft-input mt-2" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Estimated hours
            <input
              className="soft-input mt-2"
              type="number"
              min="0"
              step="0.25"
              value={estimatedHours}
              onChange={(event) => setEstimatedHours(Number(event.target.value))}
            />
          </label>
          <label className="md:col-span-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Progress: {completed ? 100 : progress}%
            <input
              className="mt-3 w-full accent-teal-600"
              type="range"
              min="0"
              max="100"
              value={completed ? 100 : progress}
              onChange={(event) => setProgress(Number(event.target.value))}
              disabled={completed}
            />
          </label>
          <label className="md:col-span-2 flex items-center gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={completed}
              onChange={(event) => setCompleted(event.target.checked)}
              className="h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Completed
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={saving || !categories.length || !availableBranches.length}>
            {saving ? "Saving..." : "Save task"}
          </button>
        </div>
      </form>
    </div>
  );
}
