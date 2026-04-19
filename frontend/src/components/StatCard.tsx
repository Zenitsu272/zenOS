import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent: "teal" | "amber" | "rose" | "sky" | "violet";
}

const accents = {
  teal: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  rose: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  sky: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
};

export default function StatCard({ label, value, icon: Icon, accent }: Props) {
  return (
    <article className="surface rounded-lg p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{label}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-md ${accents[accent]}`}>
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-4 text-3xl font-extrabold text-slate-950 dark:text-white">{value}</p>
    </article>
  );
}
