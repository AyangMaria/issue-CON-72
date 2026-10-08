import { Suspense } from "react";
import { RecommendationsList } from "@/features/recommendations/RecommendationsList";

export default function RecommendationsPage() {
  return (
    <main className="p-8 space-y-6 max-w-[1600px] mx-auto">
      <header className="pb-5 border-b border-app-border">
        <h1 className="text-3xl font-semibold tracking-tight text-fg">Recommendations</h1>
        <p className="text-sm text-fg-muted mt-1">
          Review optimization opportunities, their evidence, and what policy allows.
        </p>
      </header>
      {/* useSearchParams inside the list requires a Suspense boundary. */}
      <Suspense fallback={<div className="h-64 rounded-lg bg-app-surface border border-app-border animate-pulse" />}>
        <RecommendationsList />
      </Suspense>
    </main>
  );
}