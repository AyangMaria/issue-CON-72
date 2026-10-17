"use client";

import Link from "next/link";
import { Link2 } from "lucide-react";
import { useCapabilities } from "./queries";

const HEALTH_DOT: Record<string, string> = {
  healthy: "bg-emerald-400",
  degraded: "bg-amber-400",
  unavailable: "bg-rose-400",
  setup_required: "bg-slate-500",
};

export function IntegrationsStrip() {
  const { data, isPending, isError, error } = useCapabilities();

  if (isPending) {
    return <div className="h-20 rounded-xl bg-app-surface border border-app-border animate-pulse" />;
  }

  if (isError) {
    return (
      <div className="rounded-xl bg-app-surface border border-app-border p-4" role="alert">
        <p className="text-sm font-medium text-rose-300">Couldn&apos;t load integration health</p>
        <p className="text-xs text-slate-400 mt-1">
          {error instanceof Error ? error.message : "The capability endpoint is unavailable."}
        </p>
      </div>
    );
  }

  const healthy = data.items.filter((i) => i.health === "healthy").length;
  const degraded = data.items.filter((i) => i.health === "degraded").length;
  const other = data.items.length - healthy - degraded;

  return (
    <div className="bg-app-surface border border-app-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-sky-400" />
          <h2 className="text-xs font-mono uppercase tracking-wider text-fg-secondary font-medium">
            Connected integrations
          </h2>
        </div>
        <span className="text-xs font-mono text-slate-400">
          {healthy} healthy
          {degraded ? `, ${degraded} degraded` : ""}
          {other ? `, ${other} unavailable` : ""}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {data.items.map((item) => (
          <Link
            key={item.id}
            href="/plugins"
            title={item.message}
            className="bg-app-bg border border-app-border rounded-lg p-2.5 flex items-center gap-2.5 min-w-0 hover:border-slate-700 transition-colors"
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${HEALTH_DOT[item.health]}`} />
            <div className="min-w-0">
              <div className="text-xs font-medium text-fg truncate">{item.display_name}</div>
              <div className="font-mono text-[10px] text-slate-400 truncate">{item.capability}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}