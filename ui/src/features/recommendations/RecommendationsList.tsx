"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatMoney, titleCase } from "@/lib/format";
import { useRecommendationList } from "../overview/queries";
import type { RecommendationListItem } from "@/schemas";

const RISK_STYLES: Record<RecommendationListItem["risk"], string> = {
  low: "bg-badge-low/10 text-badge-low-text border-badge-low/25",
  medium: "bg-badge-medium/10 text-badge-medium-text border-badge-medium/25",
  high: "bg-badge-high/10 text-badge-high-text border-badge-high/25",
};

const STATUS_STYLES: Record<RecommendationListItem["status"], string> = {
  actionable: RISK_STYLES.low,
  executed: RISK_STYLES.low,
  pending_approval: RISK_STYLES.medium,
  planned: RISK_STYLES.medium,
  blocked: RISK_STYLES.high,
  superseded: "bg-app-surface-alt text-fg-secondary border-app-border",
};

// One URL param per facet. A "saved filter" is, for now, simply a bookmarked URL.
const FILTER_KEYS = ["status", "risk", "environment", "provider", "owner"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const STATIC_OPTIONS: Partial<Record<FilterKey, string[]>> = {
  status: ["actionable", "pending_approval", "planned", "blocked", "executed", "superseded"],
  risk: ["low", "medium", "high"],
};

function unique(values: string[]) {
  return Array.from(new Set(values)).sort();
}

export function RecommendationsList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filters: Record<FilterKey, string | undefined> = {
    status: searchParams.get("status") ?? undefined,
    risk: searchParams.get("risk") ?? undefined,
    environment: searchParams.get("environment") ?? undefined,
    provider: searchParams.get("provider") ?? undefined,
    owner: searchParams.get("owner") ?? undefined,
  };
  const activeCount = FILTER_KEYS.filter((k) => filters[k]).length;

  const { data, isPending, isError, error } = useRecommendationList(filters);
  // Interim: facet options come from an unfiltered query so the dropdowns
  // don't shrink as you filter. Replace with a backend facets endpoint.
  const facets = useRecommendationList({});

  function setFilter(key: FilterKey, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname);
  }

  function optionsFor(key: FilterKey): string[] {
    if (STATIC_OPTIONS[key]) return STATIC_OPTIONS[key]!;
    const items = facets.data?.items ?? [];
    if (key === "environment") return unique(items.map((i) => i.resource.environment));
    if (key === "provider") return unique(items.map((i) => i.resource.provider));
    return unique(items.map((i) => i.owner));
  }

  // Derived from the current result, so a row that disappears after a
  // refetch or filter change can't leave a ghost selection behind.
  const items = data?.items ?? [];
  const selectedItems = items.filter((i) => selected.has(i.id));

  const totalsByBasis = selectedItems.reduce<Record<string, number>>((acc, i) => {
    const k = i.estimated_savings.basis;
    acc[k] = (acc[k] ?? 0) + i.estimated_savings.amount_minor;
    return acc;
  }, {});

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const allSelected = items.length > 0 && selectedItems.length === items.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {FILTER_KEYS.map((key) => (
          <label key={key} className="flex flex-col gap-1 text-[11px] font-mono uppercase tracking-wider text-fg-muted">
            {titleCase(key)}
            <select
              value={filters[key] ?? ""}
              onChange={(e) => setFilter(key, e.target.value)}
              className="h-8 min-w-36 rounded-lg border border-app-border bg-app-surface px-2 text-xs normal-case tracking-normal text-fg"
            >
              <option value="">All</option>
              {optionsFor(key).map((o) => (
                <option key={o} value={o}>
                  {titleCase(o)}
                </option>
              ))}
            </select>
          </label>
        ))}
        {activeCount > 0 && (
          <Link
            href={pathname}
            className="h-8 px-3 inline-flex items-center rounded-lg border border-app-border text-xs text-fg hover:bg-app-surface-alt"
          >
            Reset filters
          </Link>
        )}
      </div>

      {selectedItems.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-app-border bg-app-surface px-4 py-2 text-sm"
        >
          <span className="text-fg">
            {selectedItems.length} selected · combined{" "}
            {Object.entries(totalsByBasis)
              .map(([basis, minor]) =>
                `${formatMoney({ amount_minor: minor, currency: "USD", period: "month", basis: basis as "estimated" }).display}/mo (${basis.replaceAll("_", " ")})`,
              )
              .join(" + ")}
          </span>
          <span className="flex items-center gap-3 text-xs text-fg-muted">
            Review only. Bulk actions aren&apos;t available yet.
            <button onClick={() => setSelected(new Set())} className="text-fg underline">
              Clear
            </button>
          </span>
        </div>
      )}

      <div className="bg-app-surface border border-app-border rounded-lg overflow-hidden">
        {isPending ? (
          <div aria-label="Loading recommendations" className="p-5 space-y-3 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-app-surface-alt rounded" />
            ))}
          </div>
        ) : isError ? (
          <div role="alert" className="p-6">
            <p className="text-sm font-medium text-fg">Couldn&apos;t load recommendations</p>
            <p className="text-xs text-fg-muted mt-1">
              {error instanceof Error ? error.message : "The recommendation endpoint is unavailable."}
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-fg">
              {activeCount > 0 ? "No recommendations match these filters" : "No recommendations yet"}
            </p>
            <p className="text-xs text-fg-muted mt-1">
              {activeCount > 0
                ? "Reset the filters to see everything."
                : "Evidence is being collected. Recommendations appear once enough history is available."}
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="h-9 bg-app-surface-alt border-b border-app-border font-mono text-[11px] text-fg-muted uppercase tracking-wider">
                <th className="px-3 w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all recommendations"
                    checked={allSelected}
                    onChange={() =>
                      setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))
                    }
                  />
                </th>
                <th className="px-3 font-semibold">Resource / target</th>
                <th className="px-3 font-semibold">Owner / policy</th>
                <th className="px-3 font-semibold">Risk</th>
                <th className="px-3 font-semibold">Status</th>
                <th className="px-3 font-semibold text-right">Est. savings</th>
                <th className="px-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border text-xs">
              {items.map((rec) => {
                const money = formatMoney(rec.estimated_savings);
                return (
                  <tr
                    key={rec.id}
                    // Mouse convenience only; keyboard users reach the same destination through the real link in the first cell.
                    onClick={() => router.push(`/recommendations/${rec.id}`)}
                    className="cursor-pointer hover:bg-app-surface-alt/60 transition-colors"
                  >
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${rec.resource.name}`}
                        checked={selected.has(rec.id)}
                        onChange={() => toggle(rec.id)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/recommendations/${rec.id}`}
                        className="flex flex-col min-w-0 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
                      >
                        <span className="font-medium text-fg break-all">{rec.resource.name}</span>
                        <span className="font-mono text-[10px] text-fg-muted break-all">
                          {rec.resource.provider} · {rec.resource.environment}
                          {rec.resource.namespace ? ` · ${rec.resource.namespace}` : ""}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <span className="block font-medium text-fg">{rec.owner}</span>
                      <span className="block font-mono text-[10px] text-fg-muted">{rec.policy_id}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex px-1.5 py-0.5 rounded border font-mono text-[10px] font-medium ${RISK_STYLES[rec.risk]}`}>
                        {titleCase(rec.risk)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex px-1.5 py-0.5 rounded border font-mono text-[10px] font-medium ${STATUS_STYLES[rec.status]}`}>
                        {titleCase(rec.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-fg">
                      {money.display}
                      <span className="text-[10px] font-normal text-fg-muted"> /mo ({money.basisLabel})</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/recommendations/${rec.id}`}
                        className="inline-flex h-6 items-center rounded border border-app-border px-2.5 text-xs font-medium text-fg hover:bg-app-surface-alt"
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!isPending && !isError && items.length > 0 && (
          <div className="px-5 py-3 border-t border-app-border bg-app-surface-alt/60 text-xs text-fg-muted">
            {items.length} recommendation{items.length === 1 ? "" : "s"}
            {data?.page.has_more ? " (more available — pagination not built yet)" : ""}
          </div>
        )}
      </div>
    </div>
  );
}