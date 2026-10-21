export interface PlanRecord {
  day: string;
  status: "generating" | "ready" | "failed";
  count: number;
  updated_at: string;
}

export interface PlanOperations {
  plans: PlanRecord[];
  events: Array<{
    kind: string;
    status: string;
    message: string;
    created_at: string;
  }>;
}

export interface PlanFeedback {
  state: "idle" | "generating" | "ready" | "failed";
  count: number;
  error: string | null;
  updatedAt: string | null;
}

export function readPlanFeedback(
  data: PlanOperations | undefined,
  day: string,
): PlanFeedback {
  const plan = data?.plans.find((plan) => plan.day === day);
  if (!plan) return { state: "idle", count: 0, error: null, updatedAt: null };
  const error = plan.status === "failed"
    ? data?.events
        .filter((event) => event.kind === "prepare" && event.status === "error"
          && Date.parse(event.created_at) >= Date.parse(plan.updated_at))
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0]?.message
        ?? 'Не удалось подготовить план. Попробуйте ещё раз или проверьте журнал в «Подключениях».'
    : null;
  return { state: plan.status, count: plan.count, error, updatedAt: plan.updated_at };
}
