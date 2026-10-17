import { Suspense } from "react";
import { RecommendationsScreen } from "@/features/recommendations/RecommendationsScreen";

export default function RecommendationsPage() {
  return (
    <main className="px-8 pb-8 pt-4 max-w-[1600px] mx-auto">
      {/* The screen reads URL filters, so it needs this Suspense boundary. */}
      <Suspense fallback={<div className="h-64 rounded-lg bg-app-surface border border-app-border animate-pulse" />}>
        <RecommendationsScreen />
      </Suspense>
    </main>
  );
}
