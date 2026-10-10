import { CalendarDays } from "lucide-react";
import { localDate, type AssignedDateFilter as Filter } from "../lib/assignedDate";

export default function AssignedDateFilter({ value, onChange }: {
  value: Filter;
  onChange: (filter: Filter) => void;
}) {
  return (
    <div className="assigned-date-filter" role="group" aria-label="Filter tasks by assigned date">
      <label>
        <CalendarDays size={16} /> Assigned date
        <select value={value.mode} onChange={(event) => onChange({
          ...value,
          mode: event.target.value as Filter["mode"],
          from: value.from || localDate(),
          to: value.to || value.from || localDate(),
        })}>
          <option value="all">All dates</option>
          <option value="today">Today</option>
          <option value="date">Choose date</option>
          <option value="range">Date range</option>
          <option value="undated">No assigned date</option>
        </select>
      </label>
      {(value.mode === "date" || value.mode === "range") && <label>
        {value.mode === "range" ? "From" : "Date"}
        <input type="date" value={value.from} onChange={(event) => onChange({
          ...value, from: event.target.value,
          to: value.to && event.target.value > value.to ? event.target.value : value.to,
        })} />
      </label>}
      {value.mode === "range" && <label>
        To
        <input type="date" min={value.from || undefined} value={value.to} onChange={(event) => onChange({
          ...value, to: event.target.value,
          from: value.from && event.target.value && event.target.value < value.from ? event.target.value : value.from,
        })} />
      </label>}
      <span>Tasks stay on their assigned date when rescheduled or completed.</span>
    </div>
  );
}
