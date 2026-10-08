"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Grid2x2,
  Sparkles,
  Server,
  Shield,
  Network,
  CheckCircle2,
  FileText,
  Activity,
  ChevronsLeft,
  ChevronsRight,
  Moon,
  Sun,
  Settings,
  LogOut,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Overview", href: "/", icon: Grid2x2 },
  { label: "Recommendations", href: "/recommendations", icon: Sparkles },
  { label: "Resources", href: "/resources", icon: Server },
  { label: "Policies", href: "/policies", icon: Shield },
  { label: "Plugins", href: "/plugins", icon: Network },
  { label: "Approvals", href: "/approvals", icon: CheckCircle2, badge: "3" },
  { label: "Audit", href: "/audit", icon: FileText },
  { label: "Reports", href: "/reports", icon: Activity },
] as const;

const COLLAPSE_KEY = "consize-sidebar-collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(COLLAPSE_KEY) === "true";
    setCollapsed(saved);
    document.documentElement.style.setProperty("--sidebar-width", saved ? "72px" : "240px");
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem(COLLAPSE_KEY, String(next));
    document.documentElement.style.setProperty("--sidebar-width", next ? "72px" : "240px");
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-[var(--sidebar-width,240px)] bg-app-sidebar border-r border-app-border z-50 flex flex-col justify-between transition-[width] duration-150">
      <div className="flex flex-col min-h-0">
        <div className="h-14 px-4 flex items-center justify-between border-b border-app-border shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-lg bg-app-surface border border-app-border flex items-center justify-center text-emerald-400 font-semibold text-sm">
              C
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-fg truncate">Consize</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                    v0.3
                  </span>
                </div>
                <span className="text-[10px] font-mono tracking-wider text-slate-400 uppercase">
                  Control Plane
                </span>
              </div>
            )}
          </div>
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="shrink-0 w-6 h-6 flex items-center justify-center text-slate-500 hover:text-fg rounded"
          >
            {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
          </button>
        </div>

        {!collapsed && (
          <div className="px-4 pt-5 pb-2">
            {/* <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 font-mono">
              Operational Queue
            </div> */}
          </div>
        )}

        <nav aria-label="Primary" className={`flex-1 px-3 ${collapsed ? "pt-4" : ""} space-y-1 overflow-y-auto`}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            //const isActive = pathname === item.href;
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                aria-label={item.label}
                className={`relative flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  collapsed ? "justify-center" : "justify-between"
                } ${
                  isActive
                    ? "bg-slate-800/80 text-white border-slate-700/60"
                    : "text-slate-400 hover:text-fg hover:bg-slate-800/40 border-transparent"
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-emerald-400" : "text-slate-400"}`} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </span>
                {"badge" in item &&
                  item.badge &&
                  (collapsed ? (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400" />
                  ) : (
                    <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      {item.badge}
                    </span>
                  ))}
              </Link>
            );
          })}
        </nav>
      </div>

      <WorkspaceMenu collapsed={collapsed} />
    </aside>
  );
}

function WorkspaceMenu({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <div ref={menuRef} className="relative border-t border-app-border p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Workspace menu"
        className="w-full flex items-center gap-2.5 p-2 bg-app-surface border border-app-border rounded-lg hover:border-slate-700 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-300 shrink-0">
          FL
        </div>
        {!collapsed && (
          <div className="min-w-0 text-left">
            <div className="text-xs font-medium text-fg truncate">Acme Corp Infra</div>
            <div className="text-[10px] font-mono text-emerald-400">FinOps Lead / SRE</div>
          </div>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-3 mb-2 w-60 bg-app-surface border border-app-border rounded-lg shadow-xl p-1.5 space-y-0.5 z-10"
        >
          <div className="px-2.5 py-2 border-b border-app-border mb-1">
            <div className="text-xs font-medium text-fg">Acme Corp Infra</div>
            <div className="text-[10px] text-slate-400 mt-0.5">FinOps Lead / SRE · Active Guard</div>
          </div>
          <ThemeMenuItem />
          <MenuItem icon={Settings} label="Settings" disabled reason="Not wired yet" />
          <MenuItem icon={LogOut} label="Sign out" disabled reason="Not wired yet" />
        </div>
      )}
    </div>
  );
}

function ThemeMenuItem() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    // layout.tsx's blocking script already applied the correct theme
    // before paint. This only reads it back to label the button —
    const current = document.documentElement.dataset.theme;
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("consize-theme", next);
  }

  return (
    <button
      role="menuitem"
      onClick={toggle}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs text-fg-secondary hover:bg-slate-800/60 text-left"
    >
      {theme === "dark" ? (
        <Sun className="w-4 h-4 text-amber-400" />
      ) : (
        <Moon className="w-4 h-4 text-slate-400" />
      )}
      Switch to {theme === "dark" ? "light" : "dark"} mode
    </button>
  );
}

function MenuItem({
  icon: Icon,
  label,
  disabled,
  reason,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  disabled?: boolean;
  reason?: string;
}) {
  return (
    <button
      role="menuitem"
      disabled={disabled}
      className="w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-md text-xs text-slate-300 hover:bg-slate-800/60 text-left disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      <span className="flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-slate-400" />
        {label}
      </span>
      {reason && <span className="text-[10px] text-slate-500">{reason}</span>}
    </button>
  );
}