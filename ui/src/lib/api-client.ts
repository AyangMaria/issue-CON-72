import type { z } from "zod";
import { problemSchema } from "@/schemas";

const API_BASE = process.env.NEXT_PUBLIC_CONSIZE_API_BASE_URL ?? "http://127.0.0.1:8080";

export class ApiError extends Error {
  constructor(
    public status: number,
    public problem?: z.infer<typeof problemSchema>,
  ) {
    super(problem?.title ?? (status === 0 ? "Network unreachable" : `Request failed (${status})`));
  }
}

export async function apiGet<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { signal, cache: "no-store" });
  } catch {
    // fetch() throwing means the browser couldn't reach the host at all —
    // distinct from the server responding with an error status.
    throw new ApiError(0);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    const parsed = problemSchema.safeParse(body);
    throw new ApiError(res.status, parsed.success ? parsed.data : undefined);
  }

  const json = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    // A 200 with the wrong shape is a contract break, not "unavailable" —
    // keep it distinguishable so schema drift never silently renders.
    throw new ApiError(-1, {
      title: "Response did not match the expected schema",
      status: -1,
      detail: parsed.error.message,
    });
  }
  return parsed.data;
}