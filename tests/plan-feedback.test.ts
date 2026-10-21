import { describe, expect, it } from "vitest";
import { readPlanFeedback, type PlanOperations, type PlanRecord } from "../src/pages/plan-feedback";

const day = "2026-10-22";
const updatedAt = "2026-10-21T12:00:00Z";
const plan = (status: PlanRecord["status"]): PlanRecord => ({
  day, status, count: 5, updated_at: updatedAt,
});
const event = (message: string, created_at: string, kind = "prepare", status = "error") => ({
  message, created_at, kind, status,
});

describe("readPlanFeedback", () => {
  it("does not mistake another day for tomorrow", () => {
    const data: PlanOperations = {
      plans: [
        { ...plan("ready"), day: "2026-10-21" },
        { ...plan("failed"), day: "2026-10-23" },
      ],
      events: [event("Other failure", updatedAt)],
    };
    const idle = { state: "idle", count: 0, error: null, updatedAt: null };
    expect(readPlanFeedback(data, day)).toEqual(idle);
    expect(readPlanFeedback(undefined, day)).toEqual(idle);
  });

  it("restores generating status from server data", () => {
    expect(readPlanFeedback({
      plans: [plan("generating")],
      events: [event("Previous failure", "2026-10-21T11:00:00Z")],
    }, day)).toEqual({ state: "generating", count: 5, error: null, updatedAt });
  });

  it("shows completed plan even when an earlier attempt failed", () => {
    expect(readPlanFeedback({
      plans: [plan("ready")],
      events: [event("Previous failure", "2026-10-21T11:00:00Z")],
    }, day)).toEqual({ state: "ready", count: 5, error: null, updatedAt });
  });

  it("shows only the latest error belonging to the failed attempt", () => {
    const events = [
      event("Older attempt", "2026-10-21T11:00:00Z"),
      event("Latest prepare failure", "2026-10-21T15:01:00+03:00"),
      event("Unrelated publish failure", "2026-10-21T12:02:00Z", "publish"),
      event("First prepare failure", updatedAt),
      event("Successful prepare", "2026-10-21T12:03:00Z", "prepare", "success"),
    ];
    const originalOrder = [...events];
    expect(readPlanFeedback({ plans: [plan("failed")], events }, day)).toEqual({
      state: "failed", count: 5, error: "Latest prepare failure", updatedAt,
    });
    expect(events).toEqual(originalOrder);
  });

  it("uses a clear fallback when the failure event has not arrived", () => {
    expect(readPlanFeedback({
      plans: [plan("failed")],
      events: [event("Previous failure", "2026-10-21T11:00:00Z")],
    }, day)).toEqual({
      state: "failed", count: 5, updatedAt,
      error: 'Не удалось подготовить план. Попробуйте ещё раз или проверьте журнал в «Подключениях».',
    });
  });
});
