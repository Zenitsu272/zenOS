import type { Task } from "../types";
import TaskCard from "./TaskCard";

interface Props {
  tasks: Task[];
  onComplete: (task: Task, completed: boolean) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export default function KanbanBoard({ tasks, onComplete, onEdit, onDelete }: Props) {
  const columns = [
    { title: "To do", empty: "Your next tasks will appear here.", items: tasks.filter((task) => !task.completed && task.progress === 0) },
    { title: "Doing", empty: "Tasks you've started will appear here.", items: tasks.filter((task) => !task.completed && task.progress > 0) },
    { title: "Done", empty: "Finished tasks will appear here.", items: tasks.filter((task) => task.completed) }
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {columns.map((column) => (
        <section key={column.title} className="min-h-64 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 dark:text-white">{column.title}</h2>
            <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-slate-500 dark:bg-slate-900 dark:text-slate-300">
              {column.items.length}
            </span>
          </div>
          <div className="space-y-3">
            {column.items.length === 0 && <p className="px-2 py-6 text-center text-sm leading-6 text-slate-400 dark:text-slate-500">{column.empty}</p>}
            {column.items.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onComplete={(completed) => onComplete(task, completed)}
                onEdit={() => onEdit(task)}
                onDelete={() => onDelete(task)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
