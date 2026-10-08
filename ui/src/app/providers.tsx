"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";


let mockWorkerStartPromise: Promise<void> | null = null;

function startMockServiceWorker() {
  if (!mockWorkerStartPromise) {
    mockWorkerStartPromise = import("../mocks/browser").then(async ({ worker }) => {
      await worker.start({ onUnhandledRequest: "bypass" });
    });
  }

  return mockWorkerStartPromise;
}

function useMockServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (process.env.NEXT_PUBLIC_USE_MOCKS !== "true") return;

    void startMockServiceWorker();
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  // useState(() => ...) rather than a module-level singleton: this keeps
  // each request/browser session its own QueryClient under React's
  // concurrent rendering, which matters even before SSR data-fetching
  // is added later.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 10_000,
          },
        },
      }),
  );

  useMockServiceWorker();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}