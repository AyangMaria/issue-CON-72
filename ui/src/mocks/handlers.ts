import { http, HttpResponse } from "msw";
import type { DashboardSummary, RecommendationDetail, RecommendationListItem } from "@/schemas";

export type Scenario =
  | "healthy"
  | "empty-cluster"
  | "no-recommendations"
  | "stale"
  | "partial-failure"
  | "backend-down";

let scenario: Scenario = "healthy";
export function setScenario(next: Scenario) {
  scenario = next;
}

const money = (
  amount_minor: number,
  basis: "estimated" | "verified_operational" | "billing_realized" = "estimated",
): DashboardSummary["projected_savings"] => ({
  amount_minor,
  currency: "USD",
  period: "month",
  basis,
});

const baseRecommendations: RecommendationListItem[] = [
  {
    id: "rec_01",
    version: "7",
    title: "Right-size payment-service-deployment",
    resource: {
      id: "res_01",
      name: "payment-service-deployment",
      provider: "kubernetes",
      environment: "production",
      namespace: "payments",
      region: "us-east-1",
    },
    owner: "platform",
    policy_id: "prod-conservative",
    risk: "low",
    confidence: "high",
    estimated_savings: money(420000),
    status: "actionable",
    available_remediations: [
      { method: "review", label: "Review change", enabled: true },
      {
        method: "github_pull_request",
        label: "Create PR",
        enabled: true,
        plugin_instance_id: "github-gitops:infra",
      },
    ],
  },
  {
    id: "rec_02",
    version: "3",
    title: "Downscale orders-aurora-cluster",
    resource: {
      id: "res_02",
      name: "orders-aurora-cluster",
      provider: "aws_rds",
      environment: "production",
      region: "us-east-1",
    },
    owner: "checkout",
    policy_id: "db-safe-change",
    risk: "medium",
    confidence: "medium",
    estimated_savings: money(1280000),
    status: "pending_approval",
    available_remediations: [{ method: "review", label: "Review change", enabled: true }],
  },
  {
    id: "rec_03",
    version: "2",
    title: "Right-size ml-infer-cluster",
    resource: {
      id: "res_03",
      name: "ml-infer-cluster",
      provider: "kubernetes",
      environment: "production",
      namespace: "ml-ops",
      region: "us-east-1",
    },
    owner: "ml-ops",
    policy_id: "gpu-strict",
    risk: "high",
    confidence: "low",
    estimated_savings: money(840000),
    status: "blocked",
    available_remediations: [
      { method: "direct_apply", label: "Apply directly", enabled: false, disabled_reason: "approval_required" },
    ],
  },  {
    id: "rec_04",
    version: "1",
    title: "Right-size payment-service-deployment (earlier run)",
    resource: {
      id: "res_01",
      name: "payment-service-deployment",
      provider: "kubernetes",
      environment: "production",
      namespace: "payments",
      region: "us-east-1",
    },
    owner: "platform",
    policy_id: "prod-conservative",
    risk: "low",
    confidence: "medium",
    estimated_savings: money(380000),
    status: "superseded",
    available_remediations: [
      { method: "review", label: "Review change", enabled: false, disabled_reason: "superseded" },
    ],
  },
];

// Detail payloads. Defaults describe a healthy Kubernetes right-size;
// each recommendation overrides only what makes it different.
function buildDetail(rec: RecommendationListItem, extra: Partial<RecommendationDetail> = {}): RecommendationDetail {
  return {
    ...rec,
    summary: `Requests on ${rec.resource.name} are well above observed peak usage. Lowering them keeps headroom over the 14-day P95 while reducing reserved capacity.`,
    algorithm: { id: "headroom-p95", version: "1.0.0" },
    current: { "CPU request": "8 vCPU", "Memory request": "16 GiB" },
    proposed: { "CPU request": "4 vCPU", "Memory request": "8 GiB" },
    confidence_assessment: {
      observed_history: "14 days",
      required_history: "14 days",
      coverage_ratio: 0.98,
      reasons: ["Full observation window covered", "No gaps longer than 15 minutes"],
    },
    evidence: [
      {
        signal: "CPU usage",
        value: 2.2,
        unit: "vCPU",
        aggregation: "p95",
        window: "14d",
        source: "Prometheus",
        freshness: "fresh",
        quality: "valid",
        reason_codes: [],
      },
      {
        signal: "Memory working set",
        value: 4.6,
        unit: "GiB",
        aggregation: "p95",
        window: "14d",
        source: "Prometheus",
        freshness: "fresh",
        quality: "valid",
        reason_codes: [],
      },
    ],
    policy: {
      decision: "requires_approval",
      reasons: ["Production workloads require peer approval"],
      required_approval: "SRE",
      verification: ["Error rate must not exceed baseline", "P99 latency must not regress"],
    },
    superseded_by: null,
    workload_classification: null,
    audit: [
      {
        id: "evt_a1",
        title: "Recommendation generated",
        actor: "headroom-p95 v1.0.0",
        correlation_id: "corr_a1b2c",
        occurred_at: new Date(Date.now() - 26 * 60 * 60_000).toISOString(),
        outcome: "applied",
      },
    ],
    ...extra,
  };
}

const detailOverrides: Record<string, Partial<RecommendationDetail>> = {
  rec_02: {
    current: { "Instance class": "db.r6g.4xlarge" },
    proposed: { "Instance class": "db.r6g.2xlarge" },
    evidence: [
      {
        signal: "CPU usage",
        value: 31,
        unit: "%",
        aggregation: "p95",
        window: "14d",
        source: "Prometheus",
        freshness: "stale",
        quality: "partial",
        reason_codes: ["gap_detected", "coverage_below_target"],
      },
    ],
    confidence_assessment: {
      observed_history: "9 days",
      required_history: "14 days",
      coverage_ratio: 0.64,
      reasons: ["Only 9 of 14 days observed", "Gap during last weekend"],
    },
    policy: {
      decision: "requires_approval",
      reasons: ["Database changes require DBA approval"],
      required_approval: "DBA",
      verification: ["Replica lag must stay under threshold"],
    },
  },
  rec_03: {
    current: { "GPU nodes": "4 x g5.4xlarge" },
    proposed: { "GPU nodes": "3 x g5.4xlarge" },
    evidence: [
      {
        signal: "GPU utilization",
        value: null, // genuinely no data — must render as "No data", never 0
        unit: "%",
        aggregation: "p95",
        window: "14d",
        source: "Prometheus",
        freshness: "unavailable",
        quality: "missing",
        reason_codes: ["metric_not_exported"],
      },
    ],
    confidence_assessment: {
      observed_history: "0 days",
      required_history: "14 days",
      coverage_ratio: 0,
      reasons: ["GPU utilization metric is not being exported"],
    },
    policy: {
      decision: "blocked",
      reasons: ["gpu-strict requires valid GPU utilization evidence"],
      required_approval: "ML platform lead",
      verification: ["Inference latency must not regress"],
    },
  },
  rec_04: { superseded_by: "rec_01" },
};

function detailFor(id: string): RecommendationDetail | undefined {
  const rec = baseRecommendations.find((r) => r.id === id);
  return rec ? buildDetail(rec, detailOverrides[id]) : undefined;
}

export const handlers = [
  http.get("*/api/v1/dashboard/summary", () => {
    if (scenario === "backend-down") {
      return HttpResponse.json(
        { title: "Service unavailable", status: 503, code: "backend_unavailable", retryable: true },
        { status: 503, headers: { "Content-Type": "application/problem+json" } },
      );
    }
    const summary: DashboardSummary = {
      scope: { environment: null, provider: null },
      window: "P30D",
      projected_savings: money(14825000, "estimated"),
      verified_operational_savings: money(9240000, "verified_operational"),
      pending_approvals: scenario === "empty-cluster" ? 0 : 7,
      rollback_rate: 0,
      open_recommendations: scenario === "empty-cluster" ? 0 : 84,
      generated_at: new Date().toISOString(),
      freshness: scenario === "stale" ? "stale" : "fresh",
    };
    return HttpResponse.json(summary);
  }),

  http.get("*/api/v1/recommendations", ({ request }) => {
    if (scenario === "backend-down" || scenario === "partial-failure") {
      return HttpResponse.json(
        { title: "Recommendation service unavailable", status: 503, retryable: true },
        { status: 503, headers: { "Content-Type": "application/problem+json" } },
      );
    }

    let items =
      scenario === "empty-cluster" || scenario === "no-recommendations" ? [] : baseRecommendations;

    // Unknown params are ignored here; the real API should return a
    // validation problem for them (design doc §6.7).
    const q = new URL(request.url).searchParams;
    const matchers: Record<string, (r: RecommendationListItem) => string> = {
      status: (r) => r.status,
      risk: (r) => r.risk,
      owner: (r) => r.owner,
      provider: (r) => r.resource.provider,
      environment: (r) => r.resource.environment,
    };
    for (const [key, read] of Object.entries(matchers)) {
      const wanted = q.get(key);
      if (wanted) items = items.filter((item) => read(item) === wanted);
    }

    return HttpResponse.json({ items, page: { next_cursor: null, has_more: false } });
  }),


  http.get("*/api/v1/plugins", () => {
    if (scenario === "backend-down") {
      return HttpResponse.json(
        { title: "Capability service unavailable", status: 503, retryable: true },
        { status: 503, headers: { "Content-Type": "application/problem+json" } },
      );
    }
    const items = [
      {
        id: "kubernetes",
        display_name: "Kubernetes",
        capability: "Resource discovery",
        health: scenario === "partial-failure" ? "degraded" : "healthy",
        message: scenario === "partial-failure" ? "API server latency elevated" : undefined,
        last_checked_at: new Date().toISOString(),
      },
      {
        id: "prometheus",
        display_name: "Prometheus",
        capability: "Evidence collection",
        health: "healthy",
        last_checked_at: new Date().toISOString(),
      },
    ];
    return HttpResponse.json({ items });
  }),

  http.get("*/api/v1/audit-events", () => {
    if (scenario === "backend-down" || scenario === "partial-failure") {
      return HttpResponse.json(
        { title: "Audit service unavailable", status: 503, retryable: true },
        { status: 503, headers: { "Content-Type": "application/problem+json" } },
      );
    }
    const items =
      scenario === "empty-cluster" || scenario === "no-recommendations"
        ? []
        : [
            {
              id: "evt_01",
              title: "Optimization applied: staging-worker-pool scaled down",
              actor: "auto-remediate-daemon",
              policy_id: "non-prod-auto",
              signal: "-$1,800/mo impact",
              correlation_id: "corr_8a21f",
              occurred_at: new Date(Date.now() - 12 * 60_000).toISOString(),
              outcome: "applied" as const,
            },
            {
              id: "evt_02",
              title: "Verification window passed: checkout-gateway",
              actor: "verification-worker",
              signal: "P99 42ms (threshold 65ms)",
              correlation_id: "corr_1f930",
              occurred_at: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
              outcome: "verified" as const,
            },
            {
              id: "evt_03",
              title: "Policy blocked: direct apply on payment-db",
              actor: "policy-guard",
              policy_id: "production-conservative",
              signal: "Tier-1 database direct mutation disallowed",
              correlation_id: "corr_55c2e",
              occurred_at: new Date(Date.now() - 5 * 60 * 60_000).toISOString(),
              outcome: "blocked" as const,
            },
          ];
    return HttpResponse.json({ items });
  }),

  http.get("*/api/v1/recommendations/:id", ({ params }) => {
    if (scenario === "backend-down" || scenario === "partial-failure") {
      return HttpResponse.json(
        { title: "Recommendation service unavailable", status: 503, retryable: true },
        { status: 503, headers: { "Content-Type": "application/problem+json" } },
      );
    }
    const detail =
      scenario === "empty-cluster" || scenario === "no-recommendations"
        ? undefined
        : detailFor(String(params.id));
    if (!detail) {
      return HttpResponse.json(
        { title: "Recommendation not found", status: 404, code: "not_found" },
        { status: 404, headers: { "Content-Type": "application/problem+json" } },
      );
    }
    return HttpResponse.json(detail);
  }),
];