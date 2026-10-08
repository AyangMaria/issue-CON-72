
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRecommendationList } from "./queries";
import type { RecommendationListItem } from "@/schemas";

function formatMoney(m: RecommendationListItem["estimated_savings"]) {
  const value = (m.amount_minor / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const basisLabel = m.basis === "verified_operational" ? "verified" : m.basis;
  return { display: `$${value}`, basisLabel };
}

function titleCase(s: string) {
  return s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SelectedRecommendationPanel() {
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("recommendation");
  // Same filter + same queryKey as RecommendationPanel, so this reads from
  // the already-cached list instead of firing a second network request.
  const activeStatus = searchParams.get("status") ?? undefined;
  const { data, isPending, isError, error } = useRecommendationList({ status: activeStatus });

  if (isPending) {
    return <PanelShell><div className="h-48 animate-pulse bg-app-surface-alt m-5 rounded" /></PanelShell>;
  }

  if (isError) {
    return (
      <PanelShell>
        <div className="p-5" role="alert">
          <p className="text-sm font-medium text-rose-300">Couldn&apos;t load recommendation detail</p>
          <p className="text-xs text-slate-400 mt-1">
            {error instanceof Error ? error.message : "The recommendation endpoint is unavailable."}
          </p>
        </div>
      </PanelShell>
    );
  }


  const selected = data.items.find((r) => r.id === selectedId) ?? data.items[0];

  if (!selected) {
    return (
      <PanelShell>
        <div className="p-5 text-center text-xs text-slate-400">No recommendation selected.</div>
      </PanelShell>
    );
  }

  const { display, basisLabel } = formatMoney(selected.estimated_savings);

  return (
    <PanelShell>
      <div className="p-5 space-y-5">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
            Selected recommendation
          </div>
          <h3 className="text-base font-semibold text-fg leading-snug">{selected.title}</h3>
          <p className="text-xs text-slate-400 mt-1">
            {selected.resource.name} · {selected.resource.provider} · {selected.resource.environment}
            {selected.resource.namespace ? ` · ${selected.resource.namespace}` : ""}
          </p>
        </div>

        <dl className="text-xs divide-y divide-app-border">
          <Fact label="Status" value={titleCase(selected.status)} />
          <Fact label="Confidence" value={titleCase(selected.confidence)} />
          <Fact label="Risk" value={titleCase(selected.risk)} />
          <Fact label="Owner" value={selected.owner} />
          <Fact label="Policy" value={selected.policy_id} />
          <Fact label="Estimated savings" value={`${display} /mo (${basisLabel})`} />
        </dl>

        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2">
            Available actions
          </div>
          <div className="flex flex-col gap-2">
            {selected.available_remediations.map((r) => (
              <button
                key={r.method}
                disabled={!r.enabled}
                
                className={`h-9 px-3 rounded-lg text-xs font-medium text-left transition-colors disabled:cursor-not-allowed ${
                  r.enabled
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                    : r.disabled_reason
                      ? "bg-badge-medium/10 border border-badge-medium/25 text-badge-medium-text"
                      : "bg-app-bg border border-app-border text-fg-muted"
                }`}
              >
                {r.label}
                {!r.enabled && r.disabled_reason && (
                  <span className="block text-[10px] text-badge-medium-text/80 font-normal mt-0.5">
                    {titleCase(r.disabled_reason)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <Link
          href={`/recommendations/${selected.id}`}
          className="inline-flex text-xs font-medium text-fg hover:text-emerald-500 underline underline-offset-2"
        >
          View evidence, policy and audit →
        </Link>

        {/* evidence, preflight, verification, and dependency context would be here once evidence data exists. */}
      </div>
    </PanelShell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-fg font-medium text-right">{value}</dd>
    </div>
  );
}

function PanelShell({ children }: { children: React.ReactNode }) {
  return <div className="bg-app-surface border border-app-border rounded-xl overflow-hidden">{children}</div>;
}