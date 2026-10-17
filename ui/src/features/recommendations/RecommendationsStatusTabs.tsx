"use client";

export type RecommendationCategory = "all" | "approvals" | "high-risk" | "blocked";
export type RecommendationCategoryCounts = Record<RecommendationCategory, number | null>;

type RecommendationsStatusTabsProps = {
  activeCategory: RecommendationCategory | null;
  counts: RecommendationCategoryCounts;
  onSelect: (category: RecommendationCategory) => void;
  isLoading?: boolean;
};

const CATEGORIES = [
  { id: "all", label: "All", dot: "", badge: "bg-accent-400/15 text-accent-400" },
  { id: "approvals", label: "Approvals", dot: "bg-badge-medium-text", badge: "bg-badge-medium/15 text-badge-medium-text" },
  { id: "high-risk", label: "High risk", dot: "bg-badge-high-text", badge: "bg-badge-high/15 text-badge-high-text" },
  { id: "blocked", label: "Blocked", dot: "bg-badge-high-text", badge: "bg-badge-high/15 text-badge-high-text" },
] as const;

export function RecommendationsStatusTabs({
  activeCategory,
  counts,
  onSelect,
  isLoading = false,
}: RecommendationsStatusTabsProps) {
  return (
    // These buttons filter one table, rather than opening separate tab panels.
    <div
      role="group"
      aria-label="Recommendation status filters"
      aria-busy={isLoading}
      className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-md border border-app-border bg-app-bg p-1"
    >
      {CATEGORIES.map((category) => {
        const isActive = activeCategory === category.id;
        const count = counts[category.id];

        return (
          <button
            key={category.id}
            type="button"
            aria-pressed={isActive}
            aria-controls="recommendation-results"
            onClick={() => onSelect(category.id)}
            className={`inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 ${isActive ? "bg-accent-400/10 text-accent-400" : "text-fg-secondary hover:bg-app-surface-alt"}`}
          >
            {category.dot && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${category.dot}`} />}
            <span>{category.label}</span>
            <span className={`rounded px-1 py-0.5 text-[10px] leading-none tabular-nums ${category.badge}`}>
              {count ?? "—"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
