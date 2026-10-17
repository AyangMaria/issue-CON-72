//ui/src/app/page.tsx
// "use client";

// import { useEffect, useMemo, useRef, useState } from "react";
// import {
//   Activity,
//   AlertTriangle,
//   ArrowRight,
//   Bell,
//   Calendar,
//   Check,
//   CheckCircle2,
//   ChevronDown,
//   Cloud,
//   Database,
//   Download,
//   Eye,
//   FileText,
//   Folder,
//   Gauge,
//   Grid2X2,
//   Link,
//   ListChecks,
//   Lock,
//   Network,
//   Play,
//   RotateCcw,
//   Search,
//   Server,
//   Settings,
//   Shield,
//   Sparkles,
//   Zap
// } from "lucide-react";
// import { ThemeToggle } from "./theme-toggle";

// const API_BASE = process.env.NEXT_PUBLIC_CONSIZE_API_BASE_URL ?? "http://127.0.0.1:8080";

// type ApiResource = {
//   id: string;
//   type: string;
//   provider: string;
//   name: string;
//   environment: string;
//   owner: string;
//   region: string;
//   criticality: string;
//   metadata?: Record<string, unknown>;
// };

// type ApiRecommendation = {
//   id: number;
//   resource_id: string;
//   plugin_id: string;
//   algorithm_id?: string;
//   action_type: string;
//   title: string;
//   summary: string;
//   estimated_savings_monthly: number;
//   confidence: string;
//   risk: string;
//   evidence?: string[];
//   policy_id: string;
//   status: string;
//   current?: Record<string, unknown>;
//   proposed?: Record<string, unknown>;
//   parameters?: { confidence_assessment?: { profile: string; required_history: string; observed_history: string; coverage_ratio: number; reasons: string[] }; verification_plan?: { checks?: string[]; metrics_plugin_id?: string } };
// };

// type ApiPluginStatus = {
//   manifest: {
//     id: string;
//     display_name: string;
//     category: string;
//     can_mutate_infrastructure: boolean;
//     requires_approval: boolean;
//   };
//   health: {
//     status: string;
//     message: string;
//   };
// };

// type ApiAction = {
//   plan?: { preflight?: ApiPreflightCheck[] };
//   id: number;
//   recommendation_id?: number;
//   resource_id: string;
//   plugin_id: string;
//   mode: string;
//   result: string;
//   message: string;
//   created_at: string;
//   policy_decision?: { policy_id: string; decision: string; reasons: string[] };
// };

// type ApiPreflightCheck = { id: string; status: string; message: string; details?: Record<string, unknown> };

// type ApiDashboard = {
//   verification?: { checks?: Array<{ signal: string; statistic: string; mode: string; threshold: number }> };
//   jobs?: Array<{ id: number; state: string; plan?: { preflight?: ApiPreflightCheck[] }; next_run: string; window_start: string; deadline: string; last_error?: string; verification: { rollback_on_failure: boolean; rollback_on_timeout: boolean; checks?: Array<{ signal: string; statistic: string; mode: string; threshold: number }> }; verification_result?: { status: string; reasons: string[] } }>;
//   stats: {
//     projected_savings_monthly: number;
//     verified_savings_monthly: number;
//     pending_approvals: number;
//     rollback_rate: number;
//     open_recommendations: number;
//     executed_actions: number;
//   };
//   resources: ApiResource[];
//   recommendations: ApiRecommendation[];
//   plugins: ApiPluginStatus[];
//   actions: ApiAction[];
// };



// const plugins = [
//   ["Datadog", "42 signals", "Live", "green"],
//   ["Kubecost", "$382k/mo", "Synced", "green"],
//   ["K8s Direct", "v1.28", "Ready", "green"],
//   ["GitHub GitOps", "infra-1", "PR mode", "blue"],
//   ["Slack", "#finops-alerts", "Active", "green"]
// ];


import { Suspense } from "react";
import { Play, Download } from "lucide-react";
import { RecommendationPanel } from "@/features/overview/RecommendationPanel";
import { SelectedRecommendationPanel } from "@/features/overview/SelectedRecommendationPanel";
import { MetricsRow } from "@/features/overview/MetricsRow";
import { IntegrationsStrip } from "@/features/overview/IntegrationsStrip";
import { AuditLog } from "@/features/overview/AuditLog";
import { ScenarioSwitcher } from "@/components/dev/ScenarioSwitcher";


export default function OverviewPage() {
  return (
    <main className="p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-app-border">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">Overview</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Policy Guard Active
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Real-time governed resource optimization, policy evaluation, and post-action verification.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {process.env.NODE_ENV === "development" && <ScenarioSwitcher />}
          <button
            disabled
            className="h-9 px-3.5 bg-app-surface border border-app-border text-slate-400 rounded-lg text-xs font-medium flex items-center gap-2 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Export Summary
            <span className="text-[9px] text-slate-600">· not wired</span>
          </button>
          {/* Neutral disabled treatment */}
          <button
            disabled
            className="h-9 px-4 bg-app-surface border border-app-border text-slate-400 rounded-lg text-xs font-medium flex items-center gap-2 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            Run Policy Evaluation
            <span className="text-[9px] text-slate-500">· not wired</span>
          </button>
        </div>
      </div>

      <MetricsRow />

      <IntegrationsStrip />

      {/* recommendations + audit log on the left, selected-recommendation detail on the right. */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 flex flex-col gap-6">
          <Suspense fallback={<PanelSkeletonFallback />}>
            <RecommendationPanel />
          </Suspense>
          <AuditLog />
        </div>
        <div className="xl:col-span-4 xl:sticky xl:top-20">
          <Suspense fallback={<PanelSkeletonFallback />}>
            <SelectedRecommendationPanel />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

function PanelSkeletonFallback() {
  return <div className="h-64 rounded-xl bg-app-surface border border-app-border animate-pulse" />;
}