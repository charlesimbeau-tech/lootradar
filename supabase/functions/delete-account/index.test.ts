import { createDeleteAccountHandler } from "./index.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}

function token(iat: number): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_")
      .replace(/=+$/u, "");
  return `${encode({ alg: "none" })}.${encode({ iat })}.signature`;
}

function request(iat: number, confirm: unknown = "DELETE"): Request {
  return new Request(
    "https://project.supabase.co/functions/v1/delete-account",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token(iat)}`,
        "content-type": "application/json",
        origin: "https://thelootradar.com",
      },
      body: JSON.stringify({ confirm }),
    },
  );
}

Deno.test("deletes only the freshly authenticated caller after exact confirmation", async () => {
  const deleted: string[] = [];
  const handler = createDeleteAccountHandler({
    now: () => new Date("2026-07-28T12:05:00.000Z"),
    getUser: () => Promise.resolve({ id: "user-a" }),
    deleteUser: (userId) => {
      deleted.push(userId);
      return Promise.resolve(true);
    },
  });
  const response = await handler(
    request(Date.parse("2026-07-28T12:00:00Z") / 1000),
  );
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { deleted: true });
  assertEquals(deleted, ["user-a"]);
});

Deno.test("rejects stale auth, invalid callers, and missing confirmation", async () => {
  let deletes = 0;
  const handler = createDeleteAccountHandler({
    now: () => new Date("2026-07-28T13:00:00.000Z"),
    getUser: () => Promise.resolve({ id: "user-a" }),
    deleteUser: () => {
      deletes += 1;
      return Promise.resolve(true);
    },
  });
  assertEquals(
    (await handler(request(Date.parse("2026-07-28T12:00:00Z") / 1000))).status,
    403,
  );
  assertEquals(
    (await handler(
      request(Date.parse("2026-07-28T13:00:00Z") / 1000, "delete"),
    )).status,
    400,
  );
  assertEquals(deletes, 0);

  const invalid = createDeleteAccountHandler({
    now: () => new Date("2026-07-28T13:00:00.000Z"),
    getUser: () => Promise.resolve(null),
    deleteUser: () => Promise.resolve(true),
  });
  assertEquals(
    (await invalid(request(Date.parse("2026-07-28T13:00:00Z") / 1000))).status,
    401,
  );
});
