import { apiRequest } from "./client";
import type { Category, DashboardStats, Subbranch, Task, TaskPayload } from "../types";

export function getCategories() {
  return apiRequest<Category[]>("/categories");
}

export function createCategory(name: string) {
  return apiRequest<Category>("/categories", { method: "POST", body: { name } });
}

export function updateCategory(id: number, name: string) {
  return apiRequest<Category>(`/categories/${id}`, { method: "PUT", body: { name } });
}

export function deleteCategory(id: number) {
  return apiRequest<void>(`/categories/${id}`, { method: "DELETE" });
}

export function getSubbranches(categoryId: number) {
  return apiRequest<Subbranch[]>(`/subbranches/${categoryId}`);
}

export function createSubbranch(payload: { category_id: number; name: string; notes?: string | null }) {
  return apiRequest<Subbranch>("/subbranches", { method: "POST", body: payload });
}

export function updateSubbranch(id: number, payload: { name: string; notes?: string | null }) {
  return apiRequest<Subbranch>(`/subbranches/${id}`, { method: "PUT", body: payload });
}

export function deleteSubbranch(id: number) {
  return apiRequest<void>(`/subbranches/${id}`, { method: "DELETE" });
}

export function getTasks(query?: Record<string, string | number | boolean | null | undefined>) {
  return apiRequest<Task[]>("/tasks", { query });
}

export function createTask(payload: TaskPayload) {
  return apiRequest<Task>("/tasks", { method: "POST", body: payload });
}

export function updateTask(id: number, payload: Partial<TaskPayload>) {
  return apiRequest<Task>(`/tasks/${id}`, { method: "PUT", body: payload });
}

export function deleteTask(id: number) {
  return apiRequest<void>(`/tasks/${id}`, { method: "DELETE" });
}

export function setTaskComplete(id: number, completed: boolean) {
  return apiRequest<Task>(`/tasks/${id}/complete`, {
    method: "PATCH",
    body: { completed }
  });
}

export function getDashboardStats() {
  return apiRequest<DashboardStats>("/dashboard/stats");
}
