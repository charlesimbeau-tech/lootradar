import { chooseDigestDeals, validateSnapshot } from "../_shared/alert-engine.ts";
import { createResendProvider, type EmailMessage } from "../_shared/email-provider.ts";
import { renderWeeklyDigestEmail } from "../_shared/email-templates.ts";
import { signUnsubscribe } from "../_shared/unsubscribe-token.ts";

const SNAPSHOT_URL = "https://thelootradar.com/alert-deals.json";
const PUBLIC_SITE_URL = "https://thelootradar.com/";
const ALLOWED_ORIGIN = "https://thelootradar.com";
const UNSUBSCRIBE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000 - 1_000;

export interface DigestAdminCaller {
  id: string;
  email: string;
}

export interface DigestAdminDependencies {
  adminUserIds: ReadonlySet<string>;
  resolveCaller(request: Request): Promise<DigestAdminCaller | null>;
  fetchSnapshot(signal?: AbortSignal): Promise<unknown>;
  loadProfile(userId: string, signal?: AbortSignal): Promise<unknown>;
  sendEmail(message: EmailMessage, idempotencyKey: string): Promise<{ id: string }>;
  signToken(input: {
    userId: string;
    category: "weekly_digest" | "all";
    expiresAt: string;
  }): Promise<string>;
  now?: () => Date;
  publicSiteUrl?: string;
  unsubscribeUrl?: string;
}

function headers(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: headers() });
}

function withToken(endpoint: string, token: string): string {
  const url = new URL(endpoint);
  url.searchParams.set("token", token);
  return url.toString();
}

function digestUrl(publicSiteUrl: string): string {
  return new URL("deals/best-pc-game-deals.html", publicSiteUrl).toString();
}

export function createDigestAdminHandler(
  dependencies: DigestAdminDependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: headers() });
    }
    if (request.method !== "POST") return json(405, { error: "Method not allowed" });

    let caller: DigestAdminCaller | null = null;
    try {
      caller = await dependencies.resolveCaller(request);
    } catch {
      return json(401, { error: "A valid account session is required" });
    }
    if (!caller?.id || !caller.email) {
      return json(401, { error: "A valid account session is required" });
    }
    if (!dependencies.adminUserIds.has(caller.id)) {
      return json(403, { error: "Digest administration is not available for this account" });
    }

    let body: { action?: unknown };
    try {
      body = await request.json();
    } catch {
      return json(400, { error: "A JSON request body is required" });
    }
    if (body.action !== "preview" && body.action !== "send_test") {
      return json(400, { error: "Action must be preview or send_test" });
    }

    const now = dependencies.now?.() ?? new Date();
    let snapshot;
    let profile: unknown;
    try {
      const [rawSnapshot, rawProfile] = await Promise.all([
        dependencies.fetchSnapshot(request.signal),
        dependencies.loadProfile(caller.id, request.signal),
      ]);
      snapshot = validateSnapshot(rawSnapshot, now);
      profile = rawProfile;
    } catch {
      return json(503, { error: "A current personalized digest could not be prepared" });
    }

    const deals = chooseDigestDeals(snapshot.deals, profile);
    if (deals.length !== 5) {
      return json(422, { error: "Five qualified deals do not match the saved preferences" });
    }

    const publicSiteUrl = dependencies.publicSiteUrl ?? PUBLIC_SITE_URL;
    const unsubscribeEndpoint = dependencies.unsubscribeUrl ??
      "https://wqsmpkfxuzfjfnujgnea.supabase.co/functions/v1/unsubscribe";
    const expiresAt = new Date(now.getTime() + UNSUBSCRIBE_LIFETIME_MS).toISOString();
    const [categoryToken, allToken] = await Promise.all([
      dependencies.signToken({ userId: caller.id, category: "weekly_digest", expiresAt }),
      dependencies.signToken({ userId: caller.id, category: "all", expiresAt }),
    ]);
    const categoryUnsubscribeUrl = withToken(unsubscribeEndpoint, categoryToken);
    const allUnsubscribeUrl = withToken(unsubscribeEndpoint, allToken);
    const rendered = renderWeeklyDigestEmail({
      personalized: true,
      deals: deals.map((deal) => ({
        title: deal.title,
        salePrice: deal.salePrice,
        storeName: deal.storeName,
        dealScore: deal.dealScore,
        recommendation: deal.recommendation,
      })),
      lootRadarUrl: digestUrl(publicSiteUrl),
      categoryUnsubscribeUrl,
      allUnsubscribeUrl,
    });

    const preview = {
      snapshotId: snapshot.snapshotId,
      subject: rendered.subject,
      deals: deals.map((deal) => ({
        title: deal.title,
        salePrice: deal.salePrice,
        storeName: deal.storeName,
        dealScore: deal.dealScore,
        recommendation: deal.recommendation,
        genres: [...deal.genres],
      })),
    };
    if (body.action === "preview") return json(200, preview);

    try {
      const result = await dependencies.sendEmail(
        {
          ...rendered,
          subject: `[Test] ${rendered.subject}`,
          to: caller.email,
          allUnsubscribeUrl,
        },
        `lootradar:digest-preview:${caller.id}:${snapshot.snapshotId}`,
      );
      return json(200, { delivered: true, providerMessageId: result.id, ...preview });
    } catch {
      return json(502, { error: "The test digest could not be delivered" });
    }
  };
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function productionDependencies(): DigestAdminDependencies {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const anonKey = requiredEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const unsubscribeSecret = requiredEnv("UNSUBSCRIBE_SECRET");
  const adminUserIds = new Set(
    requiredEnv("DIGEST_ADMIN_USER_IDS").split(",").map((value) => value.trim()).filter(Boolean),
  );
  return {
    adminUserIds,
    async resolveCaller(request) {
      const authorization = request.headers.get("Authorization") ?? "";
      if (!/^Bearer\s+\S+$/iu.test(authorization)) return null;
      const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: anonKey, Authorization: authorization },
      });
      if (!response.ok) return null;
      const user = await response.json() as { id?: unknown; email?: unknown };
      return typeof user.id === "string" && typeof user.email === "string"
        ? { id: user.id, email: user.email }
        : null;
    },
    async fetchSnapshot(signal) {
      const response = await fetch(SNAPSHOT_URL, {
        signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Snapshot fetch failed");
      return await response.json();
    },
    async loadProfile(userId, signal) {
      const query = new URLSearchParams({ user_id: `eq.${userId}`, select: "data", limit: "1" });
      const response = await fetch(`${supabaseUrl}/rest/v1/lr_profiles?${query}`, {
        signal,
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });
      if (!response.ok) throw new Error("Profile fetch failed");
      const rows = await response.json() as Array<{ data?: unknown }>;
      return rows[0]?.data ?? {};
    },
    async sendEmail(message, idempotencyKey) {
      return await createResendProvider({ apiKey: requiredEnv("RESEND_API_KEY") })
        .send(message, idempotencyKey);
    },
    signToken(input) {
      return signUnsubscribe(input, unsubscribeSecret);
    },
    publicSiteUrl: PUBLIC_SITE_URL,
    unsubscribeUrl: `${supabaseUrl}/functions/v1/unsubscribe`,
  };
}

if (import.meta.main) Deno.serve(createDigestAdminHandler(productionDependencies()));
