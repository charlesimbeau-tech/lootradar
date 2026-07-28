import {
  type UnsubscribeCategory,
  verifyUnsubscribe,
} from "../_shared/unsubscribe-token.ts";

const PUBLIC_CONFIRMATION_URL = "https://thelootradar.com/unsubscribe.html";

interface UnsubscribeDependencies {
  verifyToken: (
    token: string,
    now: Date,
  ) => Promise<{ userId: string; category: UnsubscribeCategory }>;
  disable: (
    userId: string,
    category: UnsubscribeCategory,
    now: string,
    signal?: AbortSignal,
  ) => Promise<void>;
  now?: () => Date;
  confirmationUrl?: string;
}

function noStore(status: number, body: string | null = null): Response {
  return new Response(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

function tokenFrom(request: Request): string | null {
  const token = new URL(request.url).searchParams.get("token");
  return token && token.length <= 4096 ? token : null;
}

export function createUnsubscribeHandler(
  dependencies: UnsubscribeDependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET" && request.method !== "POST") {
      return noStore(405, "Method not allowed");
    }
    const token = tokenFrom(request);
    if (!token) return noStore(400, "Invalid unsubscribe link");

    const now = dependencies.now?.() ?? new Date();
    let payload: { userId: string; category: UnsubscribeCategory };
    try {
      payload = await dependencies.verifyToken(token, now);
    } catch {
      return noStore(400, "Invalid or expired unsubscribe link");
    }

    if (request.method === "POST" && payload.category !== "all") {
      return noStore(400, "One-click unsubscribe requires an all-email link");
    }

    try {
      await dependencies.disable(
        payload.userId,
        payload.category,
        now.toISOString(),
      );
    } catch {
      return noStore(503, "Unsubscribe is temporarily unavailable");
    }

    if (request.method === "POST") {
      return new Response(null, {
        status: 200,
        headers: { "cache-control": "no-store" },
      });
    }

    const destination = new URL(
      dependencies.confirmationUrl ?? PUBLIC_CONFIRMATION_URL,
    );
    destination.searchParams.set("status", "success");
    destination.searchParams.set("category", payload.category);
    return new Response(null, {
      status: 303,
      headers: {
        location: destination.toString(),
        "cache-control": "no-store",
      },
    });
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
  const secret = environment("UNSUBSCRIBE_SECRET");
  const columns: Record<Exclude<UnsubscribeCategory, "all">, string> = {
    target_price: "target_price_enabled",
    free_game: "free_game_enabled",
    weekly_digest: "weekly_digest_enabled",
  };

  return createUnsubscribeHandler({
    verifyToken: (token, now) => verifyUnsubscribe(token, secret, now),
    async disable(userId, category, now) {
      const patch = category === "all"
        ? {
          target_price_enabled: false,
          free_game_enabled: false,
          weekly_digest_enabled: false,
          unsubscribed_at: now,
          updated_at: now,
        }
        : {
          [columns[category]]: false,
          updated_at: now,
        };
      const query = new URLSearchParams({ user_id: `eq.${userId}` });
      const response = await fetch(
        `${supabaseUrl}/rest/v1/lr_notification_preferences?${query}`,
        {
          method: "PATCH",
          signal: AbortSignal.timeout(15_000),
          headers: {
            apikey: serviceRoleKey,
            authorization: `Bearer ${serviceRoleKey}`,
            "content-type": "application/json",
            prefer: "return=minimal",
          },
          body: JSON.stringify(patch),
        },
      );
      if (!response.ok) {
        throw new Error(
          `Preference update failed with HTTP ${response.status}`,
        );
      }
    },
  });
}

if (import.meta.main) Deno.serve(productionHandler());
