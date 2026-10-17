"use client";

import { useEffect, useState } from "react";
import { Search, Bell, CalendarDays, ChevronDown, PanelsTopLeft, Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

export function Topbar() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    // The layout applies the saved theme before the page is painted.
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  function toggleTheme() {
    const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    setTheme(nextTheme);
    try {
      window.localStorage.setItem("consize-theme", nextTheme);
    } catch {
      // Switching still works when the browser cannot save preferences.
    }
  }

  return (
    <header className="fixed top-0 left-[var(--sidebar-width,240px)] right-0 z-40 flex h-14 items-center justify-between gap-2 overflow-x-auto border-b border-app-border bg-app-sidebar px-3 transition-[left] duration-150 lg:gap-4 lg:px-5">
      <div className="relative w-8 shrink-0 lg:w-auto lg:min-w-0 lg:max-w-[420px] lg:flex-1">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted lg:left-3" />
        <input
          type="search"
          disabled
          aria-label="Search resources, policies, and PRs"
          placeholder="Search resources, policies, and PRs…"
          title="Search resources, policies, and PRs"
          className="h-8 w-full rounded-md border border-app-border bg-app-bg text-transparent placeholder:text-transparent disabled:cursor-not-allowed lg:pl-9 lg:pr-10 lg:text-xs lg:text-fg lg:placeholder:text-fg-muted"
        />
        <kbd aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-app-border bg-app-surface px-1 text-[10px] text-fg-muted xl:block">
          ⌘K
        </kbd>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="relative">
          <PanelsTopLeft aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-accent-400" />
          <select
            aria-label="Infrastructure scope"
            title="All infrastructure"
            defaultValue="all"
            disabled
            className="h-8 w-[144px] appearance-none rounded-md border border-app-border bg-app-surface pl-8 pr-6 text-[11px] text-fg-secondary disabled:cursor-not-allowed lg:w-[160px]"
          >
            <option value="all">All infrastructure</option>
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-muted" />
        </div>

        <div className="relative">
          <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
          <select
            aria-label="Date range"
            title="Last 30 Days"
            defaultValue="30d"
            disabled
            className="h-8 w-[120px] appearance-none rounded-md border border-app-border bg-app-surface pl-8 pr-6 text-[11px] text-fg-secondary disabled:cursor-not-allowed lg:w-[136px]"
          >
            <option value="30d">Last 30 Days</option>
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-muted" />
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-app-border bg-app-surface text-fg-secondary transition-colors hover:bg-app-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
        >
          {theme === "dark" ? <Sun aria-hidden="true" className="h-3.5 w-3.5" /> : <Moon aria-hidden="true" className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          disabled
          aria-label="Notifications"
          className="relative flex h-8 w-8 items-center justify-center rounded-md border border-app-border bg-app-surface text-fg-secondary disabled:cursor-not-allowed"
        >
          <Bell aria-hidden="true" className="h-3.5 w-3.5" />
          <span aria-hidden="true" className="absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full bg-amber-400 ring-2 ring-app-surface" />
        </button>

        <span
          role="img"
          aria-label="User profile avatar"
          title="FinOps Lead / SRE"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-accent-400/30 bg-accent-400/15 text-[11px] font-medium text-accent-400"
        >
          FL
        </span>
      </div>
    </header>
  );
}
