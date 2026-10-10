import assert from "node:assert/strict";
import test from "node:test";
import { localDate, matchesAssignedDate } from "../src/lib/assignedDate.ts";

test("a task stays in its assigned day's cohort across deadlines and statuses", () => {
  const filter = { mode: "date", from: "2026-10-10", to: "" };
  for (const status of ["scheduled", "ongoing", "completed"]) {
    const task = { assigned_date: "2026-10-10", due_date: "2026-10-20", status };
    assert.equal(matchesAssignedDate(task.assigned_date, filter), true);
    assert.equal(matchesAssignedDate(task.assigned_date, { ...filter, from: task.due_date }), false);
  }
});

test("ranges include boundaries, support open ends and exclude undated tasks", () => {
  const filter = { mode: "range", from: "2026-10-10", to: "2026-10-12" };
  for (const date of ["2026-10-10", "2026-10-11", "2026-10-12"]) {
    assert.equal(matchesAssignedDate(date, filter), true);
  }
  for (const date of ["2026-10-09", "2026-10-13", null, undefined]) {
    assert.equal(matchesAssignedDate(date, filter), false);
  }
  assert.equal(matchesAssignedDate("2026-09-30", { ...filter, from: "" }), true);
  assert.equal(matchesAssignedDate("2026-11-01", { ...filter, to: "" }), true);
});

test("all, today and undated modes handle legacy tasks explicitly", () => {
  for (const date of [null, undefined, "2026-10-10"]) {
    assert.equal(matchesAssignedDate(date, { mode: "all", from: "", to: "" }), true);
    assert.equal(matchesAssignedDate(date, { mode: "undated", from: "", to: "" }), !date);
    assert.equal(matchesAssignedDate(date, { mode: "today", from: "", to: "" }, "2026-10-10"), date === "2026-10-10");
  }
});

test("local calendar date uses local midnight without UTC conversion", () => {
  assert.equal(localDate(new Date(2026, 9, 10, 0, 5)), "2026-10-10");
  assert.equal(localDate(new Date(2026, 9, 10, 23, 55)), "2026-10-10");
});
