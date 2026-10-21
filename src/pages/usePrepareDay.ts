import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, useAction } from "../api";
import { readPlanFeedback, type PlanOperations } from "./plan-feedback";

export function usePrepareDay(day: string) {
  const client = useQueryClient();
  const action = useAction();
  const [queuedBaseline, setQueuedBaseline] = useState<string | null | undefined>();
  const queued = queuedBaseline !== undefined;
  const operations = useQuery<PlanOperations>({
    queryKey: ["/operations"],
    queryFn: () => api<PlanOperations>("/operations"),
    refetchInterval: (query) => queued || action.isPending
      || readPlanFeedback(query.state.data, day).state === "generating" ? 2000 : 30000,
  });
  const feedback = readPlanFeedback(operations.data, day);
  const { reset } = action;

  useEffect(() => {
    setQueuedBaseline(undefined);
    reset();
  }, [day, reset]);

  useEffect(() => {
    if (queued && (feedback.state === "generating" || feedback.state === "ready"
      || feedback.updatedAt !== queuedBaseline)) {
      setQueuedBaseline(undefined);
    }
  }, [queued, queuedBaseline, feedback.state, feedback.updatedAt]);

  useEffect(() => {
    if (feedback.state === "ready") {
      void client.invalidateQueries({ queryKey: ["/posts"] });
    }
  }, [client, day, feedback.state, feedback.updatedAt]);

  const state = queued || action.isPending ? "queued" : feedback.state;
  const busy = state === "queued" || state === "generating";
  const loading = operations.isPending;
  return {
    state,
    count: feedback.count,
    error: action.error ?? operations.error ?? (state === "failed" ? feedback.error : null),
    busy,
    loading,
    prepare: () => {
      if (busy || loading || state === "ready") return;
      setQueuedBaseline(feedback.updatedAt);
      action.mutate({ path: "/jobs/prepare" }, {
        onError: () => setQueuedBaseline(undefined),
      });
    },
  };
}
