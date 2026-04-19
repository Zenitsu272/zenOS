import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createCategory,
  createSubbranch,
  createTask,
  deleteCategory,
  deleteSubbranch,
  deleteTask,
  getCategories,
  getDashboardStats,
  getSubbranches,
  getTasks,
  setTaskComplete,
  updateCategory,
  updateSubbranch,
  updateTask
} from "../api/workspace";
import type { Category, Subbranch, TaskPayload } from "../types";

export const queryKeys = {
  categories: ["categories"] as const,
  subbranches: (categoryId: number) => ["subbranches", categoryId] as const,
  tasks: (filters: Record<string, unknown>) => ["tasks", filters] as const,
  stats: ["dashboard-stats"] as const
};

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: getCategories
  });
}

export function useSubbranchQueries(categories: Category[] = []) {
  return useQueries({
    queries: categories.map((category) => ({
      queryKey: queryKeys.subbranches(category.id),
      queryFn: () => getSubbranches(category.id),
      enabled: Boolean(category.id)
    }))
  });
}

export function useTasks(filters: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.tasks(filters),
    queryFn: () => getTasks(filters as Record<string, string | number | boolean | null | undefined>)
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.stats,
    queryFn: getDashboardStats
  });
}

function useWorkspaceInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
    void queryClient.invalidateQueries({ queryKey: ["subbranches"] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
  };
}

export function useWorkspaceMutations() {
  const invalidate = useWorkspaceInvalidation();
  return {
    createCategory: useMutation({ mutationFn: createCategory, onSuccess: invalidate }),
    updateCategory: useMutation({
      mutationFn: ({ id, name }: { id: number; name: string }) => updateCategory(id, name),
      onSuccess: invalidate
    }),
    deleteCategory: useMutation({ mutationFn: deleteCategory, onSuccess: invalidate }),
    createSubbranch: useMutation({
      mutationFn: createSubbranch,
      onSuccess: invalidate
    }),
    updateSubbranch: useMutation({
      mutationFn: ({ id, payload }: { id: number; payload: { name: string; notes?: string | null } }) =>
        updateSubbranch(id, payload),
      onSuccess: invalidate
    }),
    deleteSubbranch: useMutation({ mutationFn: deleteSubbranch, onSuccess: invalidate }),
    createTask: useMutation({ mutationFn: createTask, onSuccess: invalidate }),
    updateTask: useMutation({
      mutationFn: ({ id, payload }: { id: number; payload: Partial<TaskPayload> }) => updateTask(id, payload),
      onSuccess: invalidate
    }),
    deleteTask: useMutation({ mutationFn: deleteTask, onSuccess: invalidate }),
    setTaskComplete: useMutation({
      mutationFn: ({ id, completed }: { id: number; completed: boolean }) => setTaskComplete(id, completed),
      onSuccess: invalidate
    })
  };
}

export function flattenSubbranches(results: ReturnType<typeof useSubbranchQueries>): Subbranch[] {
  return results.flatMap((result) => result.data ?? []);
}
