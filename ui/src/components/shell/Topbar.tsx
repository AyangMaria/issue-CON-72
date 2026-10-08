import { Search, Bell } from "lucide-react";


export function Topbar() {
  return (
    <header className="fixed top-0 left-[var(--sidebar-width,240px)] right-0 h-14 bg-app-sidebar/95 backdrop-blur-md border-b border-app-border z-40 px-6 flex items-center justify-between gap-4 transition-[left] duration-150">
      <div className="relative w-80 max-w-full">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          disabled
          placeholder="Search resources, policies, PRs…"
          className="w-full h-8 pl-9 pr-11 bg-app-bg border border-app-border rounded-lg text-xs text-fg placeholder-slate-500 disabled:cursor-not-allowed"
        />
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 bg-slate-800/80 border border-slate-700/60 rounded">
          ⌘K
        </kbd>
      </div>

      <div className="flex items-center gap-2.5">
       
        <button
          disabled
          className="hidden md:flex items-center gap-1.5 h-8 px-3 bg-app-surface border border-app-border rounded-lg text-xs font-mono text-slate-500 disabled:cursor-not-allowed"
        >
          us-east-1 / multi-cloud
          <span className="text-[9px] text-slate-600">· not wired</span>
        </button>

        <button
          disabled
          className="flex items-center gap-1.5 h-8 px-3 bg-app-surface border border-app-border rounded-lg text-xs font-mono text-slate-500 disabled:cursor-not-allowed"
        >
          Last 30 days
          <span className="text-[9px] text-slate-600">· not wired</span>
        </button>

        <button
          disabled
          aria-label="Notifications — not wired yet"
          className="relative w-8 h-8 flex items-center justify-center bg-app-surface border border-app-border rounded-lg text-slate-500 disabled:cursor-not-allowed"
        >
          <Bell className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}