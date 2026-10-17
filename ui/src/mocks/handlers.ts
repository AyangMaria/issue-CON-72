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
// Demo only: pretend the evaluation finished four minutes before this mock session.
// Keep this timestamp across list refetches so the displayed age can increase.
// A fresh page load starts a new mock session; real data will use the backend's evaluation time.
const mockEvaluatedAt = new Date(Date.now() - 4 * 60_000).toISOString();
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

const legacyRecommendations: RecommendationListItem[] = [
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
      tags: { team: "payments", tier: "1" },
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
      tags: { team: "checkout", engine: "aurora" },
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
      tags: { team: "ml-ops", hardware: "gpu" },
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
      tags: { team: "payments", tier: "1" },
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

// Sample values from the new Figma, not live infrastructure measurements.
// Keep the older examples above available for existing detail links.
const baseRecommendations: RecommendationListItem[] = [
  {
    id: "rec_01", version: "7", title: "Right-size payment-service-deployment",
    resource: {
      id: "res_01", name: "payment-service-deployment", provider: "kubernetes", environment: "production",
      namespace: "payments", region: "us-east-1", tags: { team: "payments", tier: "1" },
      kind: "compute", description: "ns: payments · Tier 1 SRE", scope: "prod-us-east-1", inspect: true,
    },
    owner: "core-pay-sre", policy_id: "prod-conservative", risk: "low", confidence: "high",
    estimated_savings: money(420000), savings_note: "-48% cost", status: "actionable",
    change_summary: { current: "c6i.2xl (8C / 16G)", proposed: "c6i.xl (4C / 8G)" },
    confidence_percentage: 98, confidence_note: "30d P95", primary_action: "github_pull_request",
    available_remediations: [
      { method: "review", label: "Review change", enabled: true },
      { method: "github_pull_request", label: "Create PR", enabled: true, plugin_instance_id: "github-gitops:infra" },
    ],
  },
  {
    id: "rec_02", version: "3", title: "Downscale orders-aurora-cluster",
    resource: {
      id: "res_02", name: "orders-aurora-cluster", provider: "aws_rds", environment: "production",
      region: "us-east-1", tags: { team: "data-infra", engine: "aurora" },
      kind: "database", description: "engine: aurora-pg15 · multi-az", scope: "us-east-1",
    },
    owner: "data-infra", policy_id: "db-safe-change", risk: "medium", confidence: "medium",
    estimated_savings: money(1280000), savings_note: "-50% mem alloc", status: "pending_approval",
    change_summary: { current: "db.r6g.4xlarge", proposed: "db.r6g.2xlarge" },
    confidence_percentage: 94, confidence_note: "14d P99", primary_action: "schedule",
    available_remediations: [
      { method: "review", label: "Review change", enabled: true },
      { method: "schedule", label: "Schedule", enabled: false, disabled_reason: "approval_required" },
    ],
  },
  {
    id: "rec_05", version: "1", title: "Optimize analytics-raw-events storage",
    resource: {
      id: "res_05", name: "analytics-raw-events", provider: "aws_s3", environment: "datalake",
      region: "aws-global", tags: { team: "data-platform", storage: "events" },
      kind: "storage", description: "s3://prod-events-lake · 42TB", scope: "aws-global",
    },
    owner: "data-platform", policy_id: "storage-lifecycle", risk: "low", confidence: "high",
    estimated_savings: money(195000), savings_note: "-68% GB-mo", status: "actionable",
    change_summary: { current: "S3 Std 42TB", proposed: "Glacier Instant" },
    confidence_percentage: 99, confidence_note: "Access: 90d", primary_action: "direct_apply",
    available_remediations: [{ method: "direct_apply", label: "Apply directly", enabled: true }],
  },
  {
    id: "rec_06", version: "1", title: "Optimize customer-support-agent-llm routing",
    resource: {
      id: "res_06", name: "customer-support-agent-llm", provider: "bedrock_openai", environment: "production",
      region: "global-api", tags: { team: "genai-sre", service: "support" },
      kind: "ai", description: "Gateway: Bedrock/OpenAI Router", scope: "global-api",
    },
    owner: "genai-sre", policy_id: "model-routing", risk: "low", confidence: "high",
    estimated_savings: money(540000), savings_note: "-72% token cost", status: "actionable",
    change_summary: { current: "gpt-4-32k direct", proposed: "Sonnet 3.5 + Cache" },
    confidence_percentage: 96, confidence_note: "Eval bench", primary_action: "direct_apply",
    available_remediations: [{ method: "direct_apply", label: "Apply directly", enabled: true }],
  },
  {
    id: "rec_07", version: "1", title: "Right-size staging-worker-pool",
    resource: {
      id: "res_07", name: "staging-worker-pool", provider: "kubernetes", environment: "staging",
      namespace: "staging-workers", region: "us-east-1", tags: { team: "qa-devops", pods: "8" },
      kind: "compute", description: "ns: staging-workers · 8 pods", scope: "stage-us-east-1",
    },
    owner: "qa-devops", policy_id: "non-prod-auto", risk: "low", confidence: "high",
    estimated_savings: money(264000), savings_note: "8 pods tuned", status: "actionable",
    change_summary: { current: "req: 4C / 12G", proposed: "req: 1C / 3G" },
    confidence_percentage: 99, confidence_note: "60d idle check", primary_action: "direct_apply",
    available_remediations: [{ method: "direct_apply", label: "Apply directly", enabled: true }],
  },
  {
    id: "rec_08", version: "1", title: "Use spot fallback for ml-training-spot-fallback",
    resource: {
      id: "res_08", name: "ml-training-spot-fallback", provider: "aws_ec2", environment: "production",
      region: "us-west-2", tags: { team: "ml-ops", hardware: "gpu" },
      kind: "gpu", description: "nodegroup: g5.12xlarge · On-Demand", scope: "prod-us-west-2",
    },
    owner: "ml-ops", policy_id: "gpu-approval", risk: "high", confidence: "medium",
    estimated_savings: money(680000), savings_note: "-62% GPU rate", status: "blocked",
    change_summary: { current: "On-Demand GPU Pool", proposed: "Spot Interruption Mix" },
    confidence_percentage: 89, confidence_note: "Spot reb 7d", primary_action: "request_approval",
    available_remediations: [{ method: "review", label: "Request approval", enabled: true }],
  },
  {
    id: "rec_09", version: "1", title: "Tune checkout-gateway-api replicas",
    resource: {
      id: "res_09", name: "checkout-gateway-api", provider: "kubernetes", environment: "production",
      namespace: "checkout", region: "us-east-1", tags: { team: "checkout-eng", service: "gateway" },
      kind: "compute", description: "ns: checkout · HPA min 12", scope: "prod-us-east-1",
    },
    owner: "checkout-eng", policy_id: "prod-conservative", risk: "low", confidence: "high",
    estimated_savings: money(145000), savings_note: "-33% static base", status: "actionable",
    change_summary: { current: "Min Replicas: 12", proposed: "Min Replicas: 8" },
    confidence_percentage: 95, confidence_note: "21d traffic", primary_action: "github_pull_request",
    available_remediations: [{ method: "github_pull_request", label: "Create PR", enabled: true }],
  },
];


// Detail payloads. Defaults describe a healthy Kubernetes right-size;
// each recommendation overrides only what makes it different.
function buildDetail(rec: RecommendationListItem, extra: Partial<RecommendationDetail> = {}): RecommendationDetail {
  return {
    ...rec,
    summary: `Requests on ${rec.resource.name} are well above observed peak usage. Lowering them keeps headroom over the 14-day P95 while reducing reserved capacity.`,
    algorithm: { id: "headroom-p95", version: "1.0.0" },
    current: rec.change_summary
      ? { Configuration: rec.change_summary.current }
      : { "CPU request": "8 vCPU", "Memory request": "16 GiB" },
    proposed: rec.change_summary
      ? { Configuration: rec.change_summary.proposed }
      : { "CPU request": "4 vCPU", "Memory request": "8 GiB" },
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
  const legacy = legacyRecommendations.find((r) => r.id === id);
  const rec = baseRecommendations.find((r) => r.id === id) ?? legacy;
  if (!rec) return undefined;

  // New design examples have list summaries, not detailed measurements.
  // Do not reuse Kubernetes CPU evidence for storage, model routing, or GPU examples.
  if (!legacy && rec.change_summary) {
    const decision = rec.status === "blocked" ? "blocked"
      : rec.status === "pending_approval" ? "requires_approval" : "allowed";
    return buildDetail(rec, {
      summary: `${rec.title}. Current: ${rec.change_summary.current}. Suggested: ${rec.change_summary.proposed}.`,
      algorithm: { id: "design-example", version: "1.0.0" },
      confidence_assessment: {
        observed_history: "No detailed observations",
        required_history: "Not specified",
        coverage_ratio: 0,
        reasons: ["Detailed evidence is unavailable for this example."],
      },
      evidence: [],
      policy: {
        decision,
        reasons: decision === "allowed" ? [] : ["This change requires review before it can proceed."],
        verification: [],
      },
      audit: [],
    });
  }
  return buildDetail(rec, detailOverrides[id]);
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


    // Demo search matches resource names, owners, namespaces, and optional tags.
    const searchTerms = (q.get("q") ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (searchTerms.length) {
      items = items.filter((item) => {
        const tags = Object.entries(item.resource.tags ?? {})
          .flatMap(([key, value]) => [key, value, `${key}:${value}`, `${key}=${value}`]);
        const searchableText = [
          item.title, item.resource.name, item.resource.namespace, item.owner,
          item.resource.provider, item.resource.environment, item.resource.region,
          item.policy_id, ...tags,
        ].filter(Boolean).join(" ").toLowerCase();
        return searchTerms.every((term) => searchableText.includes(term));
      });
    }

    return HttpResponse.json({
      items,
      evaluated_at: scenario === "empty-cluster" ? null : mockEvaluatedAt,
      page: { next_cursor: null, has_more: false },
    });
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