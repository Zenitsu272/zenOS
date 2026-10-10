export type AssignedDateFilter = {
  mode: "all" | "today" | "date" | "range" | "undated";
  from: string;
  to: string;
};

export const allAssignedDates: AssignedDateFilter = { mode: "all", from: "", to: "" };

// Calendar dates must not shift with UTC conversion (especially around midnight).
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function matchesAssignedDate(
  assignedDate: string | null | undefined,
  filter: AssignedDateFilter,
  today = localDate(),
): boolean {
  if (filter.mode === "all") return true;
  if (filter.mode === "undated") return !assignedDate;
  if (!assignedDate) return false;
  if (filter.mode === "today") return assignedDate === today;
  if (filter.mode === "date") return assignedDate === filter.from;
  return (!filter.from || assignedDate >= filter.from)
    && (!filter.to || assignedDate <= filter.to);
}
