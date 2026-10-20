"use client";

import type { RecommendationListItem } from "@/schemas";

// The Figma shows seven rows on a page. Totals come from the results, not the design's sample numbers.
const PAGE_SIZE = 7;

export function getRecommendationPage(items: RecommendationListItem[], requestedPage: number) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  // Invalid links start at page one; stale page numbers stay within the available results.
  const currentPage = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, totalPages)
    : 1;
  const start = (currentPage - 1) * PAGE_SIZE;

  return {
    items: items.slice(start, start + PAGE_SIZE),
    currentPage,
    totalPages,
    totalItems,
  };
}

type RecommendationsPaginationProps = {
  visibleCount: number;
  totalItems: number;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export function RecommendationsPagination({
  visibleCount,
  totalItems,
  currentPage,
  totalPages,
  onPageChange,
}: RecommendationsPaginationProps) {
  const buttonClass = "inline-flex h-7 cursor-pointer items-center justify-center rounded-md border border-app-border bg-app-surface px-2.5 text-[11px] text-fg-secondary transition-colors hover:bg-app-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-app-surface";

  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-app-border bg-app-bg/40 px-4 py-2.5">
      <p role="status" aria-live="polite" aria-atomic="true" className="text-[11px] text-fg-secondary">
        Showing {visibleCount} of {totalItems} recommendation{totalItems === 1 ? "" : "s"}
      </p>
      <nav aria-label="Recommendation pages" className="flex items-center gap-2">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className={buttonClass}
        >
          Previous
        </button>
        <span aria-label={`Page ${currentPage} of ${totalPages}`} className="min-w-9 text-center text-[11px] tabular-nums text-fg-secondary">
          {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className={buttonClass}
        >
          Next
        </button>
      </nav>
    </footer>
  );
}
