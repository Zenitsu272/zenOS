import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  CalendarCheck2,
  CheckCircle2,
  Flame,
  ListChecks,
  LogOut,
  Moon,
  Plus,
  Search,
  Sun,
  Target,
  TimerReset
} from "lucide-react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";

import { getMe } from "../api/auth";
import KanbanBoard from "../components/KanbanBoard";
import ProgressBars from "../components/ProgressBars";
import Sidebar from "../components/Sidebar";
import StatCard from "../components/StatCard";
import TaskCard from "../components/TaskCard";
import TaskForm from "../components/TaskForm";
import { clearToken } from "../lib/storage";
import { flattenSubbranches, useCategories, useDashboardStats, useSubbranchQueries, useTasks, useWorkspaceMutations } from "../hooks/useWorkspace";
import { useUiStore } from "../store/uiStore";
import type { Task, TaskPayload } from "../types";

const views = [
  { key: "today", label: "Today" },
  { key: "long-term", label: "Long Term" },
  { key: "board", label: "Board" },
  { key: "completed", label: "Completed" }
] as const;

export default function DashboardPage() {
  const navigate = useNavigate();
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const activeView = useUiStore((state) => state.activeView);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const search = useUiStore((state) => state.search);
  const setSearch = useUiStore((state) => state.setSearch);
  const selectedCategoryId = useUiStore((state) => state.selectedCategoryId);
  const selectedSubbranchId = useUiStore((state) => state.selectedSubbranchId);
  const setSelectedCategoryId = useUiStore((state) => state.setSelectedCategoryId);

  const userQuery = useQuery({ queryKey: ["me"], queryFn: getMe });
  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data ?? [];
  const subbranchQueries = useSubbranchQueries(categories);
  const subbranches = flattenSubbranches(subbranchQueries);
  const statsQuery = useDashboardStats();
  const mutations = useWorkspaceMutations();

  useEffect(() => {
    if (!selectedCategoryId && categories.length > 0) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId, setSelectedCategoryId]);

  const filters = useMemo(
    () => ({
      search,
      category_id: selectedCategoryId,
      subbranch_id: selectedSubbranchId
    }),
    [search, selectedCategoryId, selectedSubbranchId]
  );
  const tasksQuery = useTasks(filters);
  const tasks = tasksQuery.data ?? [];

  const today = format(new Date(), "yyyy-MM-dd");
  const visibleTasks = useMemo(() => {
    const pending = tasks.filter((task) => !task.completed);
    if (activeView === "today") {
      return pending
        .filter(
          (task) =>
            (task.task_type === "Daily" && task.due_date === today) ||
            (task.due_date !== null && task.due_date !== undefined && task.due_date < today) ||
            task.priority === "High"
        )
        .sort((a, b) => b.priority_score - a.priority_score);
    }
    if (activeView === "long-term") {
      return pending
        .filter((task) => task.task_type === "Long Term")
        .sort((a, b) => b.priority_score - a.priority_score);
    }
    if (activeView === "completed") {
      return tasks.filter((task) => task.completed);
    }
    return tasks;
  }, [activeView, tasks, today]);

  const stats = statsQuery.data;
  const activeCategory = categories.find((category) => category.id === selectedCategoryId);
  const activeSubbranch = subbranches.find((branch) => branch.id === selectedSubbranchId);

  async function saveTask(payload: TaskPayload) {
    if (editingTask) {
      await mutations.updateTask.mutateAsync({ id: editingTask.id, payload });
    } else {
      await mutations.createTask.mutateAsync(payload);
    }
  }

  function openEditTask(task: Task) {
    setEditingTask(task);
    setTaskFormOpen(true);
  }

  function logout() {
    clearToken();
    navigate("/login");
  }

  const pageTitle = selectedSubbranchId
    ? activeSubbranch?.name
    : selectedCategoryId
      ? activeCategory?.name
      : "All responsibilities";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex">
        <Sidebar
          categories={categories}
          subbranches={subbranches}
          onCreateCategory={(name) => mutations.createCategory.mutateAsync(name)}
          onUpdateCategory={(id, name) => mutations.updateCategory.mutateAsync({ id, name })}
          onDeleteCategory={(id) => mutations.deleteCategory.mutateAsync(id)}
          onCreateSubbranch={(categoryId, name) => mutations.createSubbranch.mutateAsync({ category_id: categoryId, name })}
          onUpdateSubbranch={(id, name, notes) => mutations.updateSubbranch.mutateAsync({ id, payload: { name, notes } })}
          onDeleteSubbranch={(id) => mutations.deleteSubbranch.mutateAsync(id)}
        />

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/90 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 lg:px-8">
            <div className="ml-12 flex flex-col gap-4 lg:ml-0 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
                  {format(new Date(), "EEEE, MMM d")}
                </p>
                <h1 className="mt-1 text-2xl font-extrabold text-slate-950 dark:text-white md:text-3xl">{pageTitle}</h1>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="relative block min-w-0 sm:w-80">
                  <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={18} />
                  <input
                    className="soft-input pl-10"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search tasks"
                  />
                </label>
                <button className="secondary-button" onClick={toggleTheme} type="button">
                  {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
                  {theme === "dark" ? "Light" : "Dark"}
                </button>
                <button
                  className="primary-button"
                  onClick={() => {
                    setEditingTask(null);
                    setTaskFormOpen(true);
                  }}
                  type="button"
                >
                  <Plus size={17} />
                  Task
                </button>
                <button className="icon-button border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" onClick={logout} type="button" title="Log out">
                  <LogOut size={18} />
                </button>
              </div>
            </div>
          </header>

          <div className="space-y-6 px-5 py-6 lg:px-8">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Completed today" value={stats?.tasks_completed_today ?? 0} icon={CheckCircle2} accent="teal" />
              <StatCard label="Pending" value={stats?.tasks_pending ?? 0} icon={ListChecks} accent="sky" />
              <StatCard label="Overdue" value={stats?.overdue_count ?? 0} icon={TimerReset} accent="rose" />
              <StatCard label="Daily streak" value={`${stats?.streak_days ?? 0}d`} icon={Flame} accent="amber" />
              <StatCard label="Top category" value={stats?.top_active_category_this_week ?? "None"} icon={BarChart3} accent="violet" />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
              <section className="space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                  {views.map((view) => (
                    <button
                      key={view.key}
                      className={clsx(
                        "rounded-md px-4 py-2 text-sm font-bold transition",
                        activeView === view.key
                          ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                      )}
                      onClick={() => setActiveView(view.key)}
                      type="button"
                    >
                      {view.label}
                    </button>
                  ))}
                </div>

                {tasksQuery.isLoading ? (
                  <div className="surface rounded-lg p-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading tasks...</div>
                ) : activeView === "board" ? (
                  <KanbanBoard
                    tasks={tasks}
                    onComplete={(task, completed) => mutations.setTaskComplete.mutateAsync({ id: task.id, completed })}
                    onEdit={openEditTask}
                    onDelete={(task) => {
                      if (window.confirm(`Delete ${task.title}?`)) {
                        void mutations.deleteTask.mutateAsync(task.id);
                      }
                    }}
                  />
                ) : (
                  <div className="space-y-3">
                    {visibleTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onComplete={(completed) => mutations.setTaskComplete.mutateAsync({ id: task.id, completed })}
                        onEdit={() => openEditTask(task)}
                        onDelete={() => {
                          if (window.confirm(`Delete ${task.title}?`)) {
                            void mutations.deleteTask.mutateAsync(task.id);
                          }
                        }}
                      />
                    ))}
                    {visibleTasks.length === 0 && (
                      <div className="surface rounded-lg p-8 text-center">
                        <CalendarCheck2 className="mx-auto text-teal-500" size={32} />
                        <h2 className="mt-3 text-lg font-bold text-slate-950 dark:text-white">Nothing in this view</h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          Add a task or adjust the selected category, subbranch, or search.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <aside className="space-y-6">
                <ProgressBars items={stats?.progress_by_category ?? []} />
                <div className="surface rounded-lg p-5">
                  <div className="flex items-center gap-2">
                    <Target className="text-teal-600 dark:text-teal-300" size={20} />
                    <h2 className="text-lg font-bold text-slate-950 dark:text-white">Suggested Today</h2>
                  </div>
                  <div className="mt-4 space-y-3">
                    {(stats?.suggested_today ?? []).map((task) => (
                      <div key={task.id} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                        <p className="font-bold text-slate-900 dark:text-white">{task.title}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {task.category_name} / {task.subbranch_name}
                        </p>
                        <div className="mt-3 flex items-center justify-between text-xs">
                          <span className="pill bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            score {task.priority_score}
                          </span>
                          <span className="font-semibold text-slate-500 dark:text-slate-400">{task.due_date ?? "No deadline"}</span>
                        </div>
                      </div>
                    ))}
                    {stats?.suggested_today.length === 0 && (
                      <p className="text-sm text-slate-500 dark:text-slate-400">No open tasks to suggest yet.</p>
                    )}
                  </div>
                </div>
                <div className="surface rounded-lg p-5">
                  <h2 className="text-lg font-bold text-slate-950 dark:text-white">Session</h2>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{userQuery.data?.email ?? "Signed in"}</p>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </div>

      {taskFormOpen && (
        <TaskForm
          task={editingTask}
          categories={categories}
          subbranches={subbranches}
          defaultCategoryId={selectedCategoryId}
          defaultSubbranchId={selectedSubbranchId}
          onClose={() => {
            setTaskFormOpen(false);
            setEditingTask(null);
          }}
          onSubmit={saveTask}
        />
      )}
    </main>
  );
}
