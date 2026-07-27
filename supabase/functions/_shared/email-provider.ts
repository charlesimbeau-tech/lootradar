import type { RenderedEmail } from "./email-templates.ts";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "LootRadar <deals@thelootradar.com>";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;

export interface EmailMessage extends RenderedEmail {
  to: string | string[];
  allUnsubscribeUrl: string;
}

export interface EmailProvider {
  send(
    message: EmailMessage,
    idempotencyKey: string,
    options?: EmailSendOptions,
  ): Promise<{ id: string }>;
}

export interface ResendProviderOptions {
  apiKey: string;
  from?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface EmailSendOptions {
  signal?: AbortSignal;
}

export class EmailProviderError extends Error {
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    message: string,
    options: { retryable: boolean; status?: number; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = "EmailProviderError";
    this.retryable = options.retryable;
    this.status = options.status;
  }
}

function requiredSingleLine(value: string, field: string, maxLength = 998): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength ||
    /[\r\n]/u.test(value)
  ) {
    throw new Error(`${field} is required and must fit on one line`);
  }
  return value.trim();
}

function unsubscribeUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("All-email unsubscribe URL must be a valid HTTPS URL");
  }
  const localHttp = parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  if (parsed.protocol !== "https:" && !localHttp) {
    throw new Error("All-email unsubscribe URL must be a valid HTTPS URL");
  }
  return parsed.toString();
}

function recipients(value: string | string[]): string | string[] {
  const values = Array.isArray(value) ? value : [value];
  if (
    values.length === 0 ||
    values.length > 50 ||
    values.some((recipient) =>
      typeof recipient !== "string" ||
      recipient.trim().length === 0 ||
      recipient.length > 320 ||
      /[\r\n]/u.test(recipient)
    )
  ) {
    throw new Error("At least one valid email recipient is required");
  }
  return Array.isArray(value) ? values.map((recipient) => recipient.trim()) : value.trim();
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function requestTimeout(value: number | undefined): number {
  const timeoutMs = value ?? DEFAULT_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new Error(
      `Resend timeout must be an integer between 1 and ${MAX_TIMEOUT_MS} milliseconds`,
    );
  }
  return timeoutMs;
}

function boundedSignal(
  timeoutMs: number,
  callerSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const abortFromCaller = () => {
    controller.abort(
      callerSignal?.reason ?? new DOMException("Request aborted", "AbortError"),
    );
  };
  const timeout = setTimeout(
    () =>
      controller.abort(
        new DOMException("Resend request timed out", "TimeoutError"),
      ),
    timeoutMs,
  );

  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    },
  };
}

async function providerMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as Record<string, unknown>;
    if (typeof body.message === "string" && body.message.trim()) {
      return body.message.trim().slice(0, 500);
    }
  } catch {
    // The status remains enough to classify an empty or non-JSON provider response.
  }
  return `Resend returned HTTP ${response.status}`;
}

export function createResendProvider(
  options: ResendProviderOptions,
): EmailProvider {
  if (!options || typeof options !== "object") {
    throw new Error("Resend provider options are required");
  }
  const apiKey = requiredSingleLine(options.apiKey, "Resend API key", 500);
  const from = requiredSingleLine(options.from ?? DEFAULT_FROM, "From address");
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = requestTimeout(options.timeoutMs);

  return {
    async send(message, idempotencyKey, sendOptions = {}) {
      if (!message || typeof message !== "object") {
        throw new Error("Email message is required");
      }
      const key = requiredSingleLine(idempotencyKey, "Idempotency key", 256);
      const allUnsubscribeUrl = unsubscribeUrl(message.allUnsubscribeUrl);
      const body = {
        from,
        to: recipients(message.to),
        subject: requiredSingleLine(message.subject, "Email subject"),
        html: message.html,
        text: message.text,
        headers: {
          "List-Unsubscribe": `<${allUnsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      };

      let response: Response;
      const requestSignal = boundedSignal(timeoutMs, sendOptions.signal);
      try {
        try {
          if (requestSignal.signal.aborted) {
            throw requestSignal.signal.reason;
          }
          response = await fetchImpl(RESEND_ENDPOINT, {
            method: "POST",
            redirect: "manual",
            signal: requestSignal.signal,
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "User-Agent": "LootRadar-Alerts/1.0",
              "Idempotency-Key": key,
            },
            body: JSON.stringify(body),
          });
          if (requestSignal.signal.aborted) {
            throw requestSignal.signal.reason;
          }
        } catch (error) {
          throw new EmailProviderError("Resend request failed before receiving a response", {
            retryable: true,
            cause: error,
          });
        }

        if (!response.ok) {
          throw new EmailProviderError(await providerMessage(response), {
            retryable: retryableStatus(response.status),
            status: response.status,
          });
        }

        let result: unknown;
        try {
          result = await response.json();
        } catch (error) {
          throw new EmailProviderError("Resend returned an invalid success response", {
            retryable: true,
            status: response.status,
            cause: error,
          });
        }
        const id = (result as { id?: unknown } | null)?.id;
        if (typeof id !== "string" || id.trim().length === 0) {
          throw new EmailProviderError("Resend success response did not contain an email ID", {
            retryable: true,
            status: response.status,
          });
        }
        return { id: id.trim() };
      } finally {
        requestSignal.cleanup();
      }
    },
  };
}
