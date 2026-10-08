"use client";

import { Check, FileClock, AlertTriangle, RotateCcw } from "lucide-react";
import { useAuditEvents } from "./queries";
import type { AuditEvent } from "@/schemas";

const OUTCOME_STYLE: Record<AuditEvent["outcome"], { icon: typeof Check; tone: string }> = {
  applied: { icon: Check, tone: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  verified: { icon: Check, tone: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  verifying: { icon: FileClock, tone: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
  rolled_back: { icon: RotateCcw, tone: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  blocked: { icon: AlertTriangle, tone: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
  failed: { icon: AlertTriangle, tone: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
  manual_intervention: { icon: AlertTriangle, tone: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
};

// Relative time with an exact timestamp on hover
function relativeTime(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function AuditLog() {
  const { data, isPending, isError, error } = useAuditEvents();

  return (
    <div className="bg-app-surface border border-app-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-app-border bg-app-surfaceAlt/60">
        <h2 className="text-sm font-semibold text-fg">Operational verification and audit log</h2>
      </div>

      {isPending ? (
        <div className="p-5 space-y-3 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 bg-app-surfaceAlt rounded" />
          ))}
        </div>
      ) : isError ? (
        <div className="p-6" role="alert">
          <p className="text-sm font-medium text-rose-300">Couldn&apos;t load the audit log</p>
          <p className="text-xs text-slate-400 mt-1">
            {error instanceof Error ? error.message : "The audit endpoint is unavailable."}
          </p>
        </div>
      ) : data.items.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-sm font-medium text-fg">No applied changes yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Approved actions and their verification results appear here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-app-border">
          {data.items.map((event) => {
            const style = OUTCOME_STYLE[event.outcome];
            const Icon = style.icon;
            return (
              <div key={event.id} className="p-4 flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${style.tone}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-fg">{event.title}</span>
                    <span
                      className="font-mono text-[10px] text-slate-500 shrink-0"
                      title={new Date(event.occurred_at).toLocaleString()}
                    >
                      {relativeTime(event.occurred_at)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-slate-400">
                    <span>Actor: {event.actor}</span>
                    {event.policy_id && <span>· Policy: {event.policy_id}</span>}
                    {event.signal && <span>· {event.signal}</span>}
                    <span className="font-mono text-slate-600">· {event.correlation_id}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}