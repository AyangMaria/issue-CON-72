"use client";

import { Activity, ShieldCheck, AlertTriangle, RotateCcw } from "lucide-react";
import { useDashboardSummary } from "./queries";
import type { Money } from "@/schemas";

function formatMoney(m: Money) {
  return `$${(m.amount_minor / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function MetricsRow() {
  
  const { data, isPending, isError, error } = useDashboardSummary();

  if (isPending) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-app-surface border border-app-border animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl bg-app-surface border border-app-border p-4" role="alert">
        <p className="text-sm font-medium text-rose-300">Couldn&apos;t load summary metrics</p>
        <p className="text-xs text-slate-400 mt-1">
          {error instanceof Error ? error.message : "The summary endpoint is unavailable."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <MetricCard
        label="Projected Savings"
        value={formatMoney(data.projected_savings)}
        suffix="/ mo"
        icon={Activity}
        footLeft={`${data.open_recommendations} open recs`}
        tone="emerald"
      />
      <MetricCard
        label="Verified Savings"
        value={formatMoney(data.verified_operational_savings)}
        suffix="/ mo"
        icon={ShieldCheck}
        footLeft="Operationally verified"
        tone="emerald"
      />
      <MetricCard
        label="Pending Approvals"
        value={String(data.pending_approvals)}
        suffix="actions"
        icon={AlertTriangle}
        footLeft="Requires SRE approval"
        tone="amber"
      />
      <MetricCard
        label="Rollback Rate"
        value={`${data.rollback_rate.toFixed(1)}%`}
        icon={RotateCcw}
        footLeft={data.freshness === "stale" ? "Stale — last good value shown" : "Up to date"}
        tone={data.freshness === "stale" ? "amber" : "emerald"}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  suffix,
  icon: Icon,
  footLeft,
  tone,
}: {
  label: string;
  value: string;
  suffix?: string;
  icon: React.ComponentType<{ className?: string }>;
  footLeft: string;
  tone: "emerald" | "amber";
}) {
  const toneClasses =
    tone === "amber"
      ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
      : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";

  return (
    <article className="bg-app-surface border border-app-border rounded-xl p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-wider text-slate-400">{label}</span>
        <div className={`w-7 h-7 rounded-lg border flex items-center justify-center ${toneClasses}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="my-3 text-2xl font-bold tracking-tight text-fg font-mono flex items-baseline gap-1.5">
        {value}
        {suffix && <span className="text-xs font-normal text-slate-400">{suffix}</span>}
      </div>
      <div className="pt-3 border-t border-app-border/80 text-xs text-slate-400">{footLeft}</div>
    </article>
  );
}