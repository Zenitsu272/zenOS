import { CalendarDays, Clock3, Pencil, Trash2 } from "lucide-react";
import { format, isPast, parseISO } from "date-fns";
import clsx from "clsx";

import type { Task } from "../types";

interface Props {
  task: Task;
  onComplete: (completed: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

const priorityClasses = {
  Low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  Medium: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  High: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
};

export default function TaskCard({ task, onComplete, onEdit, onDelete }: Props) {
  const dueDate = task.due_date ? parseISO(task.due_date) : null;
  const overdue = dueDate && isPast(dueDate) && !task.completed && task.due_date !== format(new Date(), "yyyy-MM-dd");

  return (
    <article className="surface rounded-lg p-4 transition hover:-translate-y-0.5">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={task.completed}
          onChange={(event) => onComplete(event.target.checked)}
          className="mt-1 h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          aria-label={`Mark ${task.title} complete`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={clsx("font-bold text-slate-950 dark:text-white", task.completed && "line-through opacity-60")}>
              {task.title}
            </h3>
            <span className={`pill ${priorityClasses[task.priority]}`}>{task.priority}</span>
            <span className="pill bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
              {task.task_type}
            </span>
          </div>
          {task.description && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{task.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>{task.category_name}</span>
            <span>/</span>
            <span>{task.subbranch_name}</span>
            {dueDate && (
              <span
                className={clsx(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1",
                  overdue
                    ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                )}
              >
                <CalendarDays size={13} />
                {format(dueDate, "MMM d")}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
              <Clock3 size={13} />
              {task.estimated_hours}h
            </span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${task.progress}%` }} />
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button className="icon-button" onClick={onEdit} type="button" title="Edit task">
            <Pencil size={16} />
          </button>
          <button className="icon-button" onClick={onDelete} type="button" title="Delete task">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}
