import type { CategoryProgress } from "../types";

export default function ProgressBars({ items }: { items: CategoryProgress[] }) {
  return (
    <div className="surface rounded-lg p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-950 dark:text-white">Category Progress</h2>
      </div>
      <div className="mt-5 space-y-4">
        {items.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No categories yet.</p>}
        {items.map((item) => (
          <div key={item.category_id}>
            <div className="mb-2 flex items-center justify-between gap-4 text-sm">
              <span className="font-semibold text-slate-700 dark:text-slate-200">{item.category_name}</span>
              <span className="text-slate-500 dark:text-slate-400">
                {item.completed_tasks}/{item.total_tasks} done
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${item.progress}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
