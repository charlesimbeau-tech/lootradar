import { createUnsubscribeHandler } from "./index.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}

function request(method: string, token = "signed-token"): Request {
  return new Request(
    `https://project.supabase.co/functions/v1/unsubscribe?token=${token}`,
    { method },
  );
}

Deno.test("valid category GET updates only its embedded user and redirects safely", async () => {
  const updates: unknown[] = [];
  const handler = createUnsubscribeHandler({
    now: () => new Date("2026-07-28T12:00:00.000Z"),
    verifyToken: () =>
      Promise.resolve({ userId: "user-a", category: "target_price" }),
    disable: (userId, category, now) => {
      updates.push({ userId, category, now });
      return Promise.resolve();
    },
  });
  const response = await handler(request("GET"));
  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "https://thelootradar.com/unsubscribe.html?status=success&category=target_price",
  );
  assertEquals(updates, [{
    userId: "user-a",
    category: "target_price",
    now: "2026-07-28T12:00:00.000Z",
  }]);
});

Deno.test("RFC 8058 POST accepts only a signed all-email token and is idempotent", async () => {
  let updates = 0;
  const handler = createUnsubscribeHandler({
    verifyToken: () => Promise.resolve({ userId: "user-a", category: "all" }),
    disable: () => {
      updates += 1;
      return Promise.resolve();
    },
  });
  assertEquals((await handler(request("POST"))).status, 200);
  assertEquals((await handler(request("POST"))).status, 200);
  assertEquals(updates, 2);
});

Deno.test("tampered, expired, and category POST tokens cannot update preferences", async () => {
  let updates = 0;
  const invalid = createUnsubscribeHandler({
    verifyToken: () => Promise.reject(new Error("bad token")),
    disable: () => {
      updates += 1;
      return Promise.resolve();
    },
  });
  assertEquals((await invalid(request("GET", "tampered"))).status, 400);

  const category = createUnsubscribeHandler({
    verifyToken: () =>
      Promise.resolve({ userId: "user-b", category: "free_game" }),
    disable: () => {
      updates += 1;
      return Promise.resolve();
    },
  });
  assertEquals((await category(request("POST"))).status, 400);
  assertEquals(updates, 0);
});
