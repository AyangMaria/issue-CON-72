import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RecommendationDetail } from "@/features/recommendations/RecommendationDetail";

// Next 15+: `params` is a Promise in server components.
export default async function RecommendationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="p-8 space-y-6 max-w-[1200px] mx-auto">
      <Link
        href="/recommendations"
        className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Recommendations
      </Link>
      {/* key={id}: switching between recommendations resets tab state. */}
      <RecommendationDetail key={id} id={id} />
    </main>
  );
}