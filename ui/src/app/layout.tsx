
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";

export const metadata: Metadata = {
  title: "Consize — Control Plane",
  description: "Policy-governed infrastructure optimization dashboard",
};

// Runs synchronously, before first paint — before React even hydrates.
const THEME_INIT_SCRIPT = `
  try {
    var t = localStorage.getItem('consize-theme');
    document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
  } catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // suppressHydrationWarning: the script above changes data-theme on the
  // client before React hydrates, which would otherwise log a one-time
  // mismatch warning against the server-rendered "dark" default. This is
  // the documented pattern for exactly this situation (same one
  // next-themes uses) — not a sign something's actually wrong.
  return (
    <html data-theme="dark" lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-app-bg text-fg font-sans antialiased">
        <Providers>
          <Sidebar />
          <Topbar />
          <div className="pl-[var(--sidebar-width,240px)] pt-14 min-h-screen transition-[padding] duration-150">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}