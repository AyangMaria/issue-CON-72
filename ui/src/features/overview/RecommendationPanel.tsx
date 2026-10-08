"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { useRecommendationList } from "./queries";
import type { RecommendationListItem } from "@/schemas";

function formatMoney(m: RecommendationListItem["estimated_savings"]) {
  const value = (m.amount_minor / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const basisLabel = m.basis === "verified_operational" ? "verified" : m.basis;
  return { display: `$${value}`, basisLabel };
}

// Theme-aware badge tokens, not a single hardcoded dark-tuned pairing 
const RISK_STYLES: Record<RecommendationListItem["risk"], string> = {
  low: "bg-badge-low/10 text-badge-low-text border-badge-low/25",
  medium: "bg-badge-medium/10 text-badge-medium-text border-badge-medium/25",
  high: "bg-badge-high/10 text-badge-high-text border-badge-high/25",
};

const TABS: { key?: string; label: string }[] = [
  { key: undefined, label: "All" },
  { key: "actionable", label: "Actionable" },
  { key: "blocked", label: "Blocked" },
  { key: "pending_approval", label: "Pending approval" },
];

export function RecommendationPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("recommendation");
  const activeStatus = searchParams.get("status") ?? undefined;

  const { data, isPending, isError, error, isRefetching } = useRecommendationList({
    status: activeStatus,
  });

  // Preserves whatever else is in the URL (e.g. the active status tab)
  // instead of overwriting it — selecting a row and switching filters
  // are separate actions and shouldn't clobber each other.
  function selectHref(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("recommendation", id);
    return `/?${params.toString()}`;
  }

  return (
    <PanelShell refreshing={isRefetching}>
      <div className="px-5 py-4 border-b border-app-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-app-surface-alt/60">
        <div className="flex items-center gap-2.5">
          <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-fg">Top Prioritized Recommendations</h2>
          {!isPending && !isError && (
            <span className="font-mono text-xs px-2 py-0.5 bg-app-bg border border-app-border text-slate-400 rounded">
              {data.items.length} items
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = activeStatus === tab.key;
            return (
              <Link
                key={tab.label}
                href={tab.key ? `/?status=${tab.key}` : "/"}
                className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap border transition-colors ${
                  isActive
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : "text-slate-400 hover:text-fg hover:bg-slate-800/60 border-transparent"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {isPending ? (
        <RowsSkeleton />
      ) : isError ? (
        <ErrorState
          title="Couldn't load recommendations"
          detail={error instanceof Error ? error.message : undefined}
        />
      ) : data.items.length === 0 ? (
        <EmptyState
          title={activeStatus ? "No recommendations match this filter" : "No recommendations yet"}
          detail={
            activeStatus
              ? "Clear the filter to see all open recommendations."
              : "Evidence is being collected. Recommendations appear once enough history is available."
          }
        />
      ) : (
        <>
          <table className="w-full text-left border-collapse table-auto">
            <thead>
              <tr className="h-9 bg-app-surface-alt border-b border-app-border font-mono text-[11px] text-slate-400 uppercase tracking-wider">
                <th className="px-3 font-semibold">Resource / Target</th>
                <th className="px-2.5 font-semibold">Owner / Policy</th>
                <th className="px-2.5 font-semibold">Risk</th>
                <th className="px-2.5 font-semibold text-right">Est. Savings</th>
                <th className="px-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border text-xs">
              {data.items.map((rec) => {
                const { display, basisLabel } = formatMoney(rec.estimated_savings);
                const isSelected = rec.id === selectedId;
                const primary = rec.available_remediations.find((r) => r.enabled);
                return (
                  <tr
                    key={rec.id}
                    // "Selecting anywhere on a row updates the
                    // selected-recommendation panel." The real,
                    // keyboard-reachable path is the Link in the first
                    // cell below; this is the mouse convenience on top.
                    onClick={() => router.push(selectHref(rec.id))}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? "bg-slate-800/30 border-l-2 border-emerald-500" : "hover:bg-slate-800/40"
                    }`}
                  >
                    <td className="px-3 py-3">
                      <Link
                        href={selectHref(rec.id)}
                        className="flex flex-col min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 rounded"
                      >
                        <span className="font-medium text-fg">{rec.resource.name}</span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {rec.resource.provider} · {rec.resource.environment}
                          {rec.resource.namespace ? ` · ${rec.resource.namespace}` : ""}
                        </span>
                      </Link>
                    </td>
                    <td className="px-2.5 py-3">
                      <div className="flex flex-col">
                        <span className="text-fg font-medium">{rec.owner}</span>
                        <span className="font-mono text-[10px] text-slate-400">{rec.policy_id}</span>
                      </div>
                    </td>
                    <td className="px-2.5 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono text-[10px] font-medium ${RISK_STYLES[rec.risk]}`}
                      >
                        {rec.risk[0]?.toUpperCase()}
                        {rec.risk.slice(1)}
                      </span>
                    </td>
                    <td className="px-2.5 py-3 text-right font-mono font-semibold text-emerald-400">
                      {display}
                      <span className="text-[10px] text-slate-400 font-normal"> /mo ({basisLabel})</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {primary ? (
                        // No stopPropagation yet: right now this button
                        // does nothing a row click doesn't already do.
                        // Once it triggers a real mutation, add
                        // e.stopPropagation() here so select and act
                        // don't fire together 
                        <button className="h-6 px-2.5 bg-app-bg hover:bg-slate-800 text-fg border border-app-border rounded text-xs font-medium">
                          {primary.label}
                        </button>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-badge-medium/10 text-badge-medium-text border border-badge-medium/25 font-mono text-[10px] font-medium">
                          {rec.available_remediations[0]?.disabled_reason ?? "Blocked"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="px-5 py-3 bg-app-surface-alt/60 border-t border-app-border flex items-center justify-between text-xs text-slate-400">
            <span>
              Showing {data.items.length} item{data.items.length === 1 ? "" : "s"}
              {data.page.has_more ? " (more available)" : ""}
            </span>
            <Link
              href="/recommendations"
              className="text-slate-300 hover:text-emerald-400 flex items-center gap-1.5 font-medium"
            >
              View full recommendation matrix →
            </Link>
          </div>
        </>
      )}
    </PanelShell>
  );
}

function PanelShell({ children, refreshing }: { children: React.ReactNode; refreshing?: boolean }) {
  return (
    <div aria-busy={refreshing} className="bg-app-surface border border-app-border rounded-xl overflow-hidden">
      {children}
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div aria-label="Loading recommendations" className="p-5 space-y-3 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-10 bg-app-surface-alt rounded" />
      ))}
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="p-10 text-center">
      <p className="text-sm font-medium text-fg">{title}</p>
      <p className="text-xs text-slate-400 mt-1">{detail}</p>
    </div>
  );
}

function ErrorState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="p-6" role="alert">
      <p className="text-sm font-medium text-rose-300">{title}</p>
      {detail && <p className="text-xs text-slate-400 mt-1">{detail}</p>}
    </div>
  );
}