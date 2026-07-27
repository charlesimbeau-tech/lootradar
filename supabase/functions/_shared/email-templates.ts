export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface EmailLinks {
  lootRadarUrl: string;
  categoryUnsubscribeUrl: string;
  allUnsubscribeUrl: string;
}

export interface TargetPriceEmailInput extends EmailLinks {
  title: string;
  salePrice: number;
  targetPrice: number;
  storeName: string;
}

export interface FreeGameEmailInput extends EmailLinks {
  title: string;
  normalPrice: number;
  storeName: string;
}

export interface DigestDeal {
  title: string;
  salePrice: number;
  storeName: string;
  dealScore: number;
  recommendation: string;
}

export interface WeeklyDigestEmailInput extends EmailLinks {
  deals: DigestDeal[];
}

const RETAILER_CAVEAT =
  "Prices and availability can change. The retailer page is authoritative for the final price and availability.";
const FREE_COVERAGE_CAVEAT =
  "Free-game coverage is limited to LootRadar's current CheapShark-derived snapshot.";
const DIGEST_COVERAGE_CAVEAT =
  "Deal coverage is limited to LootRadar's current CheapShark-derived snapshot.";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeHeaderText(
  value: string,
  field: string,
  maxLength = 300,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    throw new Error(`${field} is required`);
  }
  return value.replace(/[\r\n]+/gu, " ").trim();
}

function safeUrl(value: string, field: string): string {
  if (typeof value !== "string" || value.length > 2048) {
    throw new Error(`${field} must be a valid HTTPS URL`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${field} must be a valid HTTPS URL`);
  }
  const localHttp = parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  if (parsed.protocol !== "https:" && !localHttp) {
    throw new Error(`${field} must be a valid HTTPS URL`);
  }
  return parsed.toString();
}

function finiteMoney(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative finite number`);
  }
  return value;
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function validateLinks(input: EmailLinks): EmailLinks {
  return {
    lootRadarUrl: safeUrl(input.lootRadarUrl, "LootRadar URL"),
    categoryUnsubscribeUrl: safeUrl(
      input.categoryUnsubscribeUrl,
      "Category unsubscribe URL",
    ),
    allUnsubscribeUrl: safeUrl(input.allUnsubscribeUrl, "All-email unsubscribe URL"),
  };
}

function textFooter(links: EmailLinks, extraCaveat?: string): string {
  return [
    RETAILER_CAVEAT,
    ...(extraCaveat ? [extraCaveat] : []),
    `Open LootRadar: ${links.lootRadarUrl}`,
    `Stop this type of alert: ${links.categoryUnsubscribeUrl}`,
    `Unsubscribe from all LootRadar deal email: ${links.allUnsubscribeUrl}`,
  ].join("\n");
}

function htmlFooter(links: EmailLinks, extraCaveat?: string): string {
  const caveat = extraCaveat ? `<p style="margin:8px 0 0">${escapeHtml(extraCaveat)}</p>` : "";
  return `
    <div style="border-top:1px solid #d7ddd4;margin-top:28px;padding-top:18px;color:#536052;font-size:13px;line-height:1.55">
      <p style="margin:0">${escapeHtml(RETAILER_CAVEAT)}</p>
      ${caveat}
      <p style="margin:14px 0 0"><a href="${escapeHtml(links.lootRadarUrl)}">Open LootRadar</a></p>
      <p style="margin:8px 0 0">
        <a href="${escapeHtml(links.categoryUnsubscribeUrl)}">Stop this type of alert</a>
        &nbsp;·&nbsp;
        <a href="${
    escapeHtml(links.allUnsubscribeUrl)
  }">Unsubscribe from all LootRadar deal email</a>
      </p>
    </div>`;
}

function htmlShell(title: string, content: string, footer: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#0a0d0c;color:#172016;font-family:Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(title)}</div>
    <div style="max-width:620px;margin:0 auto;padding:28px 16px">
      <div style="background:#f7faf5;border-radius:16px;padding:28px">
        <p style="margin:0 0 22px;color:#42631b;font-size:18px;font-weight:700">LootRadar</p>
        ${content}
        ${footer}
      </div>
    </div>
  </body>
</html>`;
}

export function renderTargetPriceEmail(input: TargetPriceEmailInput): RenderedEmail {
  const links = validateLinks(input);
  const title = safeHeaderText(input.title, "Game title");
  const storeName = safeHeaderText(input.storeName, "Store name");
  const salePrice = finiteMoney(input.salePrice, "Sale price");
  const targetPrice = finiteMoney(input.targetPrice, "Target price");
  const subject = `${title} reached your ${money(targetPrice)} target`;
  const content = `
        <h1 style="margin:0;font-size:28px;line-height:1.2">${
    escapeHtml(title)
  } hit your target</h1>
        <p style="font-size:17px;line-height:1.55">
          LootRadar found it for <strong>${escapeHtml(money(salePrice))}</strong> at
          ${escapeHtml(storeName)}. Your target was ${escapeHtml(money(targetPrice))}.
        </p>
        <p style="margin:24px 0">
          <a href="${
    escapeHtml(links.lootRadarUrl)
  }" style="background:#8fd838;color:#14200c;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">See the deal on LootRadar</a>
        </p>`;
  const text = [
    `${title} hit your target`,
    "",
    `LootRadar found it for ${money(salePrice)} at ${storeName}. Your target was ${
      money(targetPrice)
    }.`,
    "",
    textFooter(links),
  ].join("\n");

  return {
    subject,
    html: htmlShell(subject, content, htmlFooter(links)),
    text,
  };
}

export function renderFreeGameEmail(input: FreeGameEmailInput): RenderedEmail {
  const links = validateLinks(input);
  const title = safeHeaderText(input.title, "Game title");
  const storeName = safeHeaderText(input.storeName, "Store name");
  const normalPrice = finiteMoney(input.normalPrice, "Normal price");
  const subject = `${title} is free right now`;
  const content = `
        <h1 style="margin:0;font-size:28px;line-height:1.2">${escapeHtml(title)} is free</h1>
        <p style="font-size:17px;line-height:1.55">
          LootRadar found a free listing at ${escapeHtml(storeName)}${
    normalPrice > 0 ? `, normally ${escapeHtml(money(normalPrice))}` : ""
  }.
        </p>
        <p style="margin:24px 0">
          <a href="${
    escapeHtml(links.lootRadarUrl)
  }" style="background:#8fd838;color:#14200c;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Check it on LootRadar</a>
        </p>`;
  const normalPriceText = normalPrice > 0 ? `, normally ${money(normalPrice)}` : "";
  const text = [
    `${title} is free`,
    "",
    `LootRadar found a free listing at ${storeName}${normalPriceText}.`,
    "",
    textFooter(links, FREE_COVERAGE_CAVEAT),
  ].join("\n");

  return {
    subject,
    html: htmlShell(
      subject,
      content,
      htmlFooter(links, FREE_COVERAGE_CAVEAT),
    ),
    text,
  };
}

export function renderWeeklyDigestEmail(input: WeeklyDigestEmailInput): RenderedEmail {
  const links = validateLinks(input);
  if (!Array.isArray(input.deals) || input.deals.length !== 5) {
    throw new Error("Weekly digest requires exactly five deals");
  }
  const deals = input.deals.map((deal) => ({
    title: safeHeaderText(deal.title, "Game title"),
    salePrice: finiteMoney(deal.salePrice, "Sale price"),
    storeName: safeHeaderText(deal.storeName, "Store name"),
    dealScore: finiteMoney(deal.dealScore, "Deal Score"),
    recommendation: safeHeaderText(
      deal.recommendation,
      "Ranking reason",
      240,
    ),
  }));
  const subject = "Five PC game deals worth a look this week";
  const listItems = deals.map((deal) =>
    `<li style="margin:0 0 14px"><strong>${escapeHtml(deal.title)}</strong> — ${
      escapeHtml(money(deal.salePrice))
    } at ${escapeHtml(deal.storeName)} <span style="color:#536052">(Deal Score ${
      escapeHtml(String(Math.round(deal.dealScore)))
    })</span><br><span style="color:#536052">${escapeHtml(deal.recommendation)}</span></li>`
  ).join("");
  const content = `
        <h1 style="margin:0;font-size:28px;line-height:1.2">Five deals worth a look</h1>
        <p style="font-size:17px;line-height:1.55">A quality-first shortlist from this week's LootRadar scan.</p>
        <ol style="padding-left:22px;font-size:16px;line-height:1.5">${listItems}</ol>
        <p style="margin:24px 0">
          <a href="${
    escapeHtml(links.lootRadarUrl)
  }" style="background:#8fd838;color:#14200c;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Explore the deals on LootRadar</a>
        </p>`;
  const dealLines = deals.map((deal, index) =>
    `${index + 1}. ${deal.title} — ${money(deal.salePrice)} at ${deal.storeName} (Deal Score ${
      Math.round(deal.dealScore)
    })\n   ${deal.recommendation}`
  );
  const text = [
    "Five deals worth a look",
    "",
    "A quality-first shortlist from this week's LootRadar scan.",
    "",
    ...dealLines,
    "",
    textFooter(links, DIGEST_COVERAGE_CAVEAT),
  ].join("\n");

  return {
    subject,
    html: htmlShell(
      subject,
      content,
      htmlFooter(links, DIGEST_COVERAGE_CAVEAT),
    ),
    text,
  };
}
