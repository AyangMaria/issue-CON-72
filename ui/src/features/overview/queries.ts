import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "@/lib/api-client";
import {
  auditEventListSchema,
  capabilityListSchema,
  dashboardSummarySchema,
  recommendationDetailSchema,
  recommendationListSchema,
} from "@/schemas";

export const queryKeys = {
  dashboard: {
    summary: (scope: { environment?: string; window?: string } = {}) =>
      ["dashboard", "summary", scope] as const,
  },
  recommendations: {
    all: ["recommendations"] as const,
    list: (filters: Record<string, string | undefined>) =>
      ["recommendations", "list", filters] as const,
    detail: (id: string) => ["recommendations", "detail", id] as const,
  },
  capabilities: ["capabilities"] as const,
  auditEvents: ["audit-events"] as const,
};

export function useDashboardSummary(scope: { environment?: string; window?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.dashboard.summary(scope),
    queryFn: ({ signal }) => apiGet("/api/v1/dashboard/summary", dashboardSummarySchema, signal),
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
  });
}

export function useRecommendationList(filters: Record<string, string | undefined> = {}) {
  const query = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => entry[1] !== undefined),
  ).toString();

  return useQuery({
    queryKey: queryKeys.recommendations.list(filters),
    queryFn: ({ signal }) =>
      apiGet(`/api/v1/recommendations${query ? `?${query}` : ""}`, recommendationListSchema, signal),
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
  });
}

export function useCapabilities() {
  return useQuery({
    queryKey: queryKeys.capabilities,
    queryFn: ({ signal }) => apiGet("/api/v1/plugins", capabilityListSchema, signal),
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
  });
}

export function useAuditEvents() {
  return useQuery({
    queryKey: queryKeys.auditEvents,
    queryFn: ({ signal }) => apiGet("/api/v1/audit-events", auditEventListSchema, signal),
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
  });
}

// No placeholderData here, deliberately: keeping the previous result is
// right for a list, but for a detail keyed by id it would briefly show
// recommendation A's content under recommendation B's URL.
export function useRecommendationDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.recommendations.detail(id),
    queryFn: ({ signal }) =>
      apiGet(`/api/v1/recommendations/${encodeURIComponent(id)}`, recommendationDetailSchema, signal),
   
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
    refetchInterval: 30_000,
  });
}