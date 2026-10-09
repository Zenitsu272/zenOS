import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarCheck2,
  Check,
  CheckCircle2,
  CircleHelp,
  Flame,
  FolderPlus,
  ListPlus,
  ListChecks,
  LogOut,
  Moon,
  Plus,
  Search,
  Sun,
  Target,
  TimerReset,
} from "lucide-react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";

import { getMe } from "../api/auth";
import KanbanBoard from "../components/KanbanBoard";
import ProgressBars from "../components/ProgressBars";
import Sidebar from "../components/Sidebar";
import PersonalOrganizer, {
  PersonalHelp,
} from "../components/PersonalOrganizer";
import StatCard from "../components/StatCard";
import TaskCard from "../components/TaskCard";
import TaskForm from "../components/TaskForm";
import { clearToken } from "../lib/storage";
import {
  flattenSubbranches,
  useCategories,
  useDashboardStats,
  useSubbranchQueries,
  useTasks,
  useWorkspaceMutations,
} from "../hooks/useWorkspace";
import { useUiStore } from "../store/uiStore";
import type { Category, Subbranch, Task, TaskPayload } from "../types";

const views = [
  { key: "all", label: "All tasks" },
  { key: "today", label: "Today" },
  { key: "long-term", label: "Longer goals" },
  { key: "board", label: "Board" },
  { key: "completed", label: "Done" },
] as const;

export default function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [organizer, setOrganizer] = useState<{
    kind: "folder" | "list";
    categoryId: number | null;
  } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");

  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const activeView = useUiStore((state) => state.activeView);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const search = useUiStore((state) => state.search);
  const setSearch = useUiStore((state) => state.setSearch);
  const selectedCategoryId = useUiStore((state) => state.selectedCategoryId);
  const selectedSubbranchId = useUiStore((state) => state.selectedSubbranchId);
  const setSelectedCategoryId = useUiStore(
    (state) => state.setSelectedCategoryId,
  );
  const setSelectedSubbranchId = useUiStore(
    (state) => state.setSelectedSubbranchId,
  );
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);

  const userQuery = useQuery({ queryKey: ["me"], queryFn: getMe });
  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data ?? [];
  const subbranchQueries = useSubbranchQueries(categories);
  const subbranches = flattenSubbranches(subbranchQueries);
  const statsQuery = useDashboardStats();
  const mutations = useWorkspaceMutations();

  useEffect(() => {
    if (
      categoriesQuery.isSuccess &&
      selectedCategoryId !== null &&
      !categories.some((category) => category.id === selectedCategoryId)
    ) {
      setSelectedCategoryId(null);
    }
  }, [
    categories,
    categoriesQuery.isSuccess,
    selectedCategoryId,
    setSelectedCategoryId,
  ]);

  useEffect(() => {
    if (
      selectedSubbranchId !== null &&
      categoriesQuery.isSuccess &&
      subbranchQueries.every((query) => query.isSuccess) &&
      !subbranches.some(
        (branch) =>
          branch.id === selectedSubbranchId &&
          branch.category_id === selectedCategoryId,
      )
    )
      setSelectedSubbranchId(null);
  }, [
    categoriesQuery.isSuccess,
    subbranchQueries,
    subbranches,
    selectedCategoryId,
    selectedSubbranchId,
    setSelectedSubbranchId,
  ]);

  const filters = useMemo(
    () => ({
      search,
      category_id: selectedCategoryId,
      subbranch_id: selectedSubbranchId,
    }),
    [search, selectedCategoryId, selectedSubbranchId],
  );
  const tasksQuery = useTasks(filters);
  const tasks = tasksQuery.data ?? [];

  const today = format(new Date(), "yyyy-MM-dd");
  const visibleTasks = useMemo(() => {
    const pending = tasks.filter((task) => !task.completed);
    if (activeView === "all")
      return pending.sort((a, b) => b.priority_score - a.priority_score);
    if (activeView === "today") {
      return pending
        .filter(
          (task) =>
            task.due_date === today ||
            (task.due_date !== null &&
              task.due_date !== undefined &&
              task.due_date < today) ||
            task.priority === "High",
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
  const activeCategory = categories.find(
    (category) => category.id === selectedCategoryId,
  );
  const activeSubbranch = subbranches.find(
    (branch) => branch.id === selectedSubbranchId,
  );
  const hasTasks =
    tasks.length > 0 ||
    !!stats?.progress_by_category.some((folder) => folder.total_tasks > 0);
  const setupLoading =
    categoriesQuery.isPending ||
    subbranchQueries.some((query) => query.isPending);
  const hasUsableList = subbranches.some(
    (branch) =>
      selectedCategoryId === null || branch.category_id === selectedCategoryId,
  );
  const loadError =
    categoriesQuery.error ||
    tasksQuery.error ||
    statsQuery.error ||
    subbranchQueries.find((query) => query.error)?.error;

  function openOrganizer(kind: "folder" | "list", categoryId?: number) {
    setSidebarOpen(false);
    setOrganizer({
      kind: kind === "list" && !categories.length ? "folder" : kind,
      categoryId: categoryId ?? selectedCategoryId ?? categories[0]?.id ?? null,
    });
  }

  function addTask() {
    setNotice("");
    if (!categories.length) {
      openOrganizer("folder");
      return;
    }
    if (
      !subbranches.some(
        (branch) =>
          !selectedCategoryId || branch.category_id === selectedCategoryId,
      )
    ) {
      openOrganizer("list");
      return;
    }
    setEditingTask(null);
    setTaskFormOpen(true);
  }

  async function createOrganizer(name: string, categoryId?: number) {
    if (organizer?.kind === "folder") {
      const folder = await mutations.createCategory.mutateAsync(name);
      queryClient.setQueryData<Category[]>(["categories"], (old) => [
        ...(old ?? []).filter((item) => item.id !== folder.id),
        folder,
      ]);
      setSelectedCategoryId(folder.id);
      setNotice(`“${folder.name}” is ready. Add a list inside it next.`);
    } else if (categoryId) {
      const list = await mutations.createSubbranch.mutateAsync({
        category_id: categoryId,
        name,
      });
      queryClient.setQueryData<Subbranch[]>(
        ["subbranches", categoryId],
        (old) => [...(old ?? []).filter((item) => item.id !== list.id), list],
      );
      setSelectedCategoryId(categoryId);
      setSelectedSubbranchId(list.id);
      setNotice(`“${list.name}” is ready. You can add your first task.`);
    }
    setSearch("");
    setActiveView("all");
  }

  async function saveTask(payload: TaskPayload) {
    if (editingTask) {
      await mutations.updateTask.mutateAsync({ id: editingTask.id, payload });
    } else {
      await mutations.createTask.mutateAsync(payload);
      setSelectedCategoryId(payload.category_id);
      setSelectedSubbranchId(payload.subbranch_id);
      setSearch("");
      setActiveView("all");
      setNotice("");
    }
  }

  async function updateTaskAction(action: () => Promise<unknown>) {
    setActionError("");
    try {
      await action();
    } catch (e) {
      setActionError(
        e instanceof Error
          ? e.message
          : "Couldn't update the task. Please try again.",
      );
    }
  }

  function openEditTask(task: Task) {
    setEditingTask(task);
    setTaskFormOpen(true);
  }

  function logout() {
    clearToken();
    queryClient.clear();
    navigate("/login");
  }

  const pageTitle = selectedSubbranchId
    ? activeSubbranch?.name
    : selectedCategoryId
      ? activeCategory?.name
      : "My tasks";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex">
        <Sidebar
          categories={categories}
          subbranches={subbranches}
          onAddFolder={() => openOrganizer("folder")}
          onAddList={(id) => openOrganizer("list", id)}
          onShowHelp={() => {
            setSidebarOpen(false);
            setHelpOpen(true);
          }}
          onUpdateCategory={(id, name) =>
            mutations.updateCategory.mutateAsync({ id, name })
          }
          onDeleteCategory={(id) => mutations.deleteCategory.mutateAsync(id)}
          onUpdateSubbranch={(id, name, notes) =>
            mutations.updateSubbranch.mutateAsync({
              id,
              payload: { name, notes },
            })
          }
          onDeleteSubbranch={(id) => mutations.deleteSubbranch.mutateAsync(id)}
        />

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/90 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 lg:px-8">
            <div className="ml-12 flex flex-wrap items-center justify-between gap-4 lg:ml-0">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
                  Personal workspace
                </p>
                <h1 className="mt-1 break-words text-2xl font-extrabold text-slate-950 dark:text-white md:text-3xl">
                  {pageTitle ?? "My tasks"}
                </h1>
                <p className="mt-1 text-xs text-slate-500">
                  Just for you · {format(new Date(), "EEEE, MMM d")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link to="/" className="secondary-button">
                  Team spaces
                </Link>
                <button
                  className="icon-button"
                  onClick={() => setHelpOpen(true)}
                  type="button"
                  aria-label="How to use this"
                  title="How to use this"
                >
                  <CircleHelp size={19} />
                </button>
                <button
                  className="icon-button"
                  onClick={toggleTheme}
                  type="button"
                  aria-label={
                    theme === "dark" ? "Use light theme" : "Use dark theme"
                  }
                  title={theme === "dark" ? "Light theme" : "Dark theme"}
                >
                  {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
                </button>
                <button
                  className="icon-button border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                  onClick={logout}
                  type="button"
                  title="Log out"
                >
                  <LogOut size={18} />
                </button>
              </div>
            </div>
          </header>

          <div className="space-y-6 px-5 py-6 lg:px-8">
            <section
              aria-label="Create and organize"
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div>
                <h2 className="text-sm font-bold">Make it your own</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Folders hold lists. Lists hold tasks.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className={
                    !categories.length ? "primary-button" : "secondary-button"
                  }
                  type="button"
                  disabled={setupLoading}
                  onClick={() => openOrganizer("folder")}
                >
                  <FolderPlus size={17} />
                  New folder
                </button>
                <button
                  className={
                    categories.length > 0 && !hasUsableList
                      ? "primary-button"
                      : "secondary-button"
                  }
                  type="button"
                  disabled={setupLoading}
                  onClick={() => openOrganizer("list")}
                >
                  <ListPlus size={17} />
                  New list
                </button>
                <button
                  className={
                    hasUsableList ? "primary-button" : "secondary-button"
                  }
                  type="button"
                  disabled={setupLoading}
                  onClick={addTask}
                >
                  <Plus size={17} />
                  Add task
                </button>
              </div>
            </section>
            {notice && (
              <p
                role="status"
                className="flex items-start gap-2 rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-800 dark:bg-teal-950 dark:text-teal-200"
              >
                <Check size={18} className="shrink-0" />
                {notice}
              </p>
            )}
            {(loadError || actionError) && (
              <p
                role="alert"
                className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-200"
              >
                {actionError ||
                  (loadError instanceof Error
                    ? loadError.message
                    : "Couldn't load your tasks. Please refresh to try again.")}
              </p>
            )}
            {!hasTasks &&
              !setupLoading &&
              !statsQuery.isPending &&
              !loadError && (
                <section className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-white p-6 dark:border-teal-900 dark:from-teal-950/40 dark:via-slate-900 dark:to-slate-900 sm:p-8">
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                    Your space, your way
                  </span>
                  <h2 className="mt-3 text-2xl font-extrabold tracking-tight">
                    A fresh start for your plans.
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                    Start with what matters to you. A folder, a list, and one
                    small task are all you need.
                  </p>
                  <div className="my-6 grid gap-3 sm:grid-cols-3">
                    {[
                      {
                        title: "Create a folder",
                        text: "Give a part of your life or work a home.",
                        icon: FolderPlus,
                        done: categories.length > 0,
                      },
                      {
                        title: "Add a list",
                        text: "Keep related tasks together inside a folder.",
                        icon: ListPlus,
                        done: subbranches.length > 0,
                      },
                      {
                        title: "Add your first task",
                        text: "Write it down. Tick it off when you're done.",
                        icon: ListChecks,
                        done: false,
                      },
                    ].map(({ title, text, icon: Icon, done }, index) => (
                      <div
                        key={title}
                        className="rounded-xl border border-slate-200/80 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/80"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <Icon
                            size={21}
                            className="text-teal-600 dark:text-teal-300"
                          />
                          <span className="text-xs font-semibold text-slate-400">
                            {done ? (
                              <Check
                                size={16}
                                className="text-teal-600"
                                aria-label="Complete"
                              />
                            ) : (
                              `0${index + 1}`
                            )}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold">{title}</h3>
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          {text}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      className="primary-button"
                      type="button"
                      onClick={
                        !categories.length
                          ? () => openOrganizer("folder")
                          : !subbranches.length
                            ? () => openOrganizer("list")
                            : addTask
                      }
                    >
                      <Plus size={17} />
                      {!categories.length
                        ? "Create your first folder"
                        : !subbranches.length
                          ? "Add your first list"
                          : "Add your first task"}
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
                      onClick={() => setHelpOpen(true)}
                      type="button"
                    >
                      <CircleHelp size={17} />
                      Show me how
                    </button>
                  </div>
                </section>
              )}
            {hasTasks && (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <StatCard
                  label="Completed today"
                  value={stats?.tasks_completed_today ?? 0}
                  icon={CheckCircle2}
                  accent="teal"
                />
                <StatCard
                  label="To do"
                  value={stats?.tasks_pending ?? 0}
                  icon={ListChecks}
                  accent="sky"
                />
                <StatCard
                  label="Overdue"
                  value={stats?.overdue_count ?? 0}
                  icon={TimerReset}
                  accent="rose"
                />
                <StatCard
                  label="Daily streak"
                  value={`${stats?.streak_days ?? 0}d`}
                  icon={Flame}
                  accent="amber"
                />
                <StatCard
                  label="Most active folder"
                  value={stats?.top_active_category_this_week ?? "None"}
                  icon={BarChart3}
                  accent="violet"
                />
              </div>
            )}

            {(hasTasks ||
              setupLoading ||
              !statsQuery.isSuccess ||
              !!search) && (
              <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
                <section className="space-y-5">
                  <label className="relative block">
                    <Search
                      className="pointer-events-none absolute left-3 top-2.5 text-slate-400"
                      size={18}
                    />
                    <input
                      className="soft-input pl-10"
                      aria-label="Search personal tasks"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search your tasks"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {views.map((view) => (
                      <button
                        key={view.key}
                        className={clsx(
                          "rounded-md px-4 py-2 text-sm font-bold transition",
                          activeView === view.key
                            ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                            : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
                        )}
                        onClick={() => setActiveView(view.key)}
                        type="button"
                      >
                        {view.label}
                      </button>
                    ))}
                  </div>

                  {tasksQuery.isLoading ? (
                    <div className="surface rounded-lg p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      Loading tasks...
                    </div>
                  ) : activeView === "board" ? (
                    <KanbanBoard
                      tasks={tasks}
                      onComplete={(task, completed) =>
                        void updateTaskAction(() =>
                          mutations.setTaskComplete.mutateAsync({
                            id: task.id,
                            completed,
                          }),
                        )
                      }
                      onEdit={openEditTask}
                      onDelete={(task) => {
                        if (window.confirm(`Delete ${task.title}?`)) {
                          void updateTaskAction(() =>
                            mutations.deleteTask.mutateAsync(task.id),
                          );
                        }
                      }}
                    />
                  ) : (
                    <div className="space-y-3">
                      {visibleTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          onComplete={(completed) =>
                            void updateTaskAction(() =>
                              mutations.setTaskComplete.mutateAsync({
                                id: task.id,
                                completed,
                              }),
                            )
                          }
                          onEdit={() => openEditTask(task)}
                          onDelete={() => {
                            if (window.confirm(`Delete ${task.title}?`)) {
                              void updateTaskAction(() =>
                                mutations.deleteTask.mutateAsync(task.id),
                              );
                            }
                          }}
                        />
                      ))}
                      {visibleTasks.length === 0 && (
                        <div className="surface rounded-lg p-8 text-center">
                          <CalendarCheck2
                            className="mx-auto text-teal-500"
                            size={32}
                          />
                          <h2 className="mt-3 text-lg font-bold text-slate-950 dark:text-white">
                            {activeView === "completed"
                              ? "Your finished tasks will appear here"
                              : "No tasks here yet"}
                          </h2>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {activeView === "today"
                              ? "This view shows tasks due today, overdue tasks, and tasks marked high importance."
                              : "Choose another folder or list, clear your search, or add a task."}
                          </p>
                          <button
                            type="button"
                            className="secondary-button mt-4"
                            onClick={addTask}
                          >
                            <Plus size={16} />
                            Add task
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </section>

                <aside className="space-y-6">
                  <ProgressBars items={stats?.progress_by_category ?? []} />
                  <div className="surface rounded-lg p-5">
                    <div className="flex items-center gap-2">
                      <Target
                        className="text-teal-600 dark:text-teal-300"
                        size={20}
                      />
                      <h2 className="text-lg font-bold text-slate-950 dark:text-white">
                        Worth a look
                      </h2>
                    </div>
                    <div className="mt-4 space-y-3">
                      {(stats?.suggested_today ?? []).map((task) => (
                        <div
                          key={task.id}
                          className="rounded-md border border-slate-200 p-3 dark:border-slate-800"
                        >
                          <p className="font-bold text-slate-900 dark:text-white">
                            {task.title}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {task.category_name} / {task.subbranch_name}
                          </p>
                          <div className="mt-3 flex items-center justify-between text-xs">
                            <span className="pill bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                              {task.priority} importance
                            </span>
                            <span className="font-semibold text-slate-500 dark:text-slate-400">
                              {task.due_date ?? "No deadline"}
                            </span>
                          </div>
                        </div>
                      ))}
                      {stats?.suggested_today.length === 0 && (
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          No open tasks to suggest yet.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="surface rounded-lg p-5">
                    <h2 className="text-sm font-bold text-slate-950 dark:text-white">
                      Your personal account
                    </h2>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      {userQuery.data?.email ?? "Signed in"}
                    </p>
                  </div>
                </aside>
              </div>
            )}
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
      {organizer && (
        <PersonalOrganizer
          kind={organizer.kind}
          categories={categories}
          initialCategoryId={organizer.categoryId}
          onCreate={createOrganizer}
          onClose={() => setOrganizer(null)}
        />
      )}
      {helpOpen && <PersonalHelp onClose={() => setHelpOpen(false)} />}
    </main>
  );
}
