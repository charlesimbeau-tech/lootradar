const MAX_SESSION_AGE_SECONDS = 10 * 60;
const MAX_FUTURE_SKEW_SECONDS = 5 * 60;
const ALLOWED_ORIGIN = "https://thelootradar.com";

interface DeleteDependencies {
  now?: () => Date;
  getUser: (
    authorization: string,
    signal?: AbortSignal,
  ) => Promise<{ id: string } | null>;
  deleteUser: (userId: string, signal?: AbortSignal) => Promise<boolean>;
}

function corsHeaders(_origin: string | null): HeadersInit {
  return {
    "access-control-allow-origin": ALLOWED_ORIGIN,
    "access-control-allow-headers":
      "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    "cache-control": "no-store",
    "vary": "Origin",
  };
}

function response(
  status: number,
  body: Record<string, unknown> | null,
  origin: string | null,
): Response {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: {
      ...corsHeaders(origin),
      ...(body ? { "content-type": "application/json; charset=utf-8" } : {}),
    },
  });
}

function bearer(request: Request): string | null {
  const value = request.headers.get("authorization");
  return value && /^Bearer [^\s]+$/u.test(value) ? value : null;
}

function issuedAt(authorization: string): number | null {
  try {
    const token = authorization.slice("Bearer ".length);
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const normalized = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const payload = JSON.parse(atob(padded)) as { iat?: unknown };
    return Number.isSafeInteger(payload.iat) ? Number(payload.iat) : null;
  } catch {
    return null;
  }
}

export function createDeleteAccountHandler(
  dependencies: DeleteDependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    if (request.method === "OPTIONS") return response(204, null, origin);
    if (request.method !== "POST") {
      return response(405, { error: "Method not allowed" }, origin);
    }

    const authorization = bearer(request);
    if (!authorization) {
      return response(401, { error: "Authentication required" }, origin);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return response(400, { error: "Confirmation required" }, origin);
    }
    if (
      !body || typeof body !== "object" || Array.isArray(body) ||
      (body as { confirm?: unknown }).confirm !== "DELETE"
    ) {
      return response(400, { error: "Confirmation required" }, origin);
    }

    const nowSeconds = Math.floor(
      (dependencies.now?.() ?? new Date()).getTime() / 1000,
    );
    const iat = issuedAt(authorization);
    if (
      iat === null ||
      iat > nowSeconds + MAX_FUTURE_SKEW_SECONDS ||
      nowSeconds - iat > MAX_SESSION_AGE_SECONDS
    ) {
      return response(403, { error: "Recent authentication required" }, origin);
    }

    let user: { id: string } | null;
    try {
      user = await dependencies.getUser(authorization);
    } catch {
      return response(401, { error: "Authentication required" }, origin);
    }
    if (!user?.id) {
      return response(401, { error: "Authentication required" }, origin);
    }

    try {
      const deleted = await dependencies.deleteUser(user.id);
      if (!deleted) return response(500, { error: "Deletion failed" }, origin);
    } catch {
      return response(500, { error: "Deletion failed" }, origin);
    }
    return response(200, { deleted: true }, origin);
  };
}

function environment(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required server configuration: ${name}`);
  return value;
}

function productionHandler() {
  const supabaseUrl = environment("SUPABASE_URL").replace(/\/+$/u, "");
  const serviceRoleKey = environment("SUPABASE_SERVICE_ROLE_KEY");
  const fetchWithTimeout = (url: string, init: RequestInit) =>
    fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });

  return createDeleteAccountHandler({
    async getUser(authorization) {
      const result = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: serviceRoleKey,
          authorization,
        },
      });
      if (!result.ok) return null;
      const value = await result.json() as { id?: unknown };
      return typeof value.id === "string" ? { id: value.id } : null;
    },
    async deleteUser(userId) {
      const result = await fetchWithTimeout(
        `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
          headers: {
            apikey: serviceRoleKey,
            authorization: `Bearer ${serviceRoleKey}`,
          },
        },
      );
      return result.ok;
    },
  });
}

if (import.meta.main) Deno.serve(productionHandler());
