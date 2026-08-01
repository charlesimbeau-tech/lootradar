'use strict';

// Game pages used to exist only while their game was discounted. When a sale
// ended the file was deleted and the URL started returning 404 — 86 pages
// disappeared across two refreshes on 2026-07-31 alone. A page has to survive
// long enough to be crawled, weighed and indexed, which takes weeks, so pages
// that come and go on a three-hour cycle never get there. They sit in
// "Discovered, currently not indexed" indefinitely, because the URLs have
// taught Google not to trust them.
//
// This keeps a game once it has qualified. The page stays up and switches to
// showing the last price we actually saw, which is honest and answers a real
// question: is this on sale right now, and what does it normally cost?

const RETENTION_DAYS = Number(process.env.GAME_ARCHIVE_RETENTION_DAYS || 90);
// Bounds the archive so an abandoned catalogue cannot grow without limit.
const ARCHIVE_LIMIT = Number(process.env.GAME_ARCHIVE_LIMIT || 600);

// Everything the page template reads. `raw` and the bulkier enrichment fields
// are deliberately dropped: this file is committed on every refresh, so it has
// to stay small enough not to bloat the repository.
const CARRIED_FIELDS = [
  'key', 'title', 'steamAppID', 'slug', 'genres', 'tags', 'userRating',
  'reviewCount', 'criticScore', 'releaseYear', 'releaseDate', 'image',
  'dealScore', 'salePrice', 'normalPrice', 'discount', 'storeName', 'storeID',
  'dealID', 'isIndie'
];

function pickCarried(deal) {
  const entry = {};
  for (const field of CARRIED_FIELDS) {
    if (deal[field] !== undefined) entry[field] = deal[field];
  }
  return entry;
}

function toTime(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function emptyArchive() {
  return { version: 1, updatedAt: null, games: {} };
}

function readArchive(value) {
  if (!value || typeof value !== 'object' || !value.games) return emptyArchive();
  return { version: 1, updatedAt: value.updatedAt || null, games: { ...value.games } };
}

/**
 * Fold the currently qualifying deals into the stored archive.
 *
 * Live deals refresh their entry and are marked live. Entries absent from this
 * snapshot keep whatever price we last recorded and are marked not live, so the
 * page can say "not discounted right now" instead of vanishing.
 */
function mergeArchive(previous, liveDeals, options = {}) {
  const archive = readArchive(previous);
  const now = options.now ? new Date(options.now).toISOString() : new Date().toISOString();
  const retentionDays = Number(options.retentionDays ?? RETENTION_DAYS);
  const limit = Math.max(0, Number(options.limit ?? ARCHIVE_LIMIT));

  const games = {};
  for (const [key, stored] of Object.entries(archive.games)) {
    games[key] = { ...stored, live: false };
  }

  for (const deal of liveDeals || []) {
    if (!deal || !deal.key) continue;
    const previousEntry = games[deal.key];
    games[deal.key] = {
      ...pickCarried(deal),
      live: true,
      lastSeenAt: now,
      // Preserve the date this game first earned a page. It is the closest
      // thing we have to a page age, and it is useful for deciding what to
      // prune when the archive is full.
      firstSeenAt: previousEntry?.firstSeenAt || now,
      // Carried, not recomputed. This tracks when the rendered page last
      // changed, which is rarer than a refresh and is what the sitemap reports
      // as lastmod. Rebuilding the entry from the deal would reset it on every
      // run and make the sitemap claim daily changes that did not happen.
      ...(previousEntry?.contentChangedAt ? { contentChangedAt: previousEntry.contentChangedAt } : {}),
      ...(previousEntry?.contentSignature ? { contentSignature: previousEntry.contentSignature } : {})
    };
  }

  const nowMs = toTime(now) ?? Date.now();
  const cutoff = retentionDays > 0 ? nowMs - retentionDays * 86400000 : null;

  const kept = Object.values(games).filter(entry => {
    if (entry.live) return true;
    if (cutoff === null) return true;
    const seen = toTime(entry.lastSeenAt);
    // An entry with an unreadable timestamp is dropped rather than kept
    // forever; it cannot be aged out otherwise.
    if (seen === null) return false;
    return seen >= cutoff;
  });

  // Live entries first, then whatever was seen most recently. Trimming from the
  // bottom removes the pages least likely to be earning anything.
  kept.sort((a, b) => {
    if (a.live !== b.live) return a.live ? -1 : 1;
    return (toTime(b.lastSeenAt) || 0) - (toTime(a.lastSeenAt) || 0);
  });

  const trimmed = kept.slice(0, limit);
  return {
    version: 1,
    updatedAt: now,
    games: Object.fromEntries(trimmed.map(entry => [entry.key, entry]))
  };
}

function archiveEntries(archive) {
  return Object.values(readArchive(archive).games);
}

module.exports = {
  ARCHIVE_LIMIT,
  RETENTION_DAYS,
  archiveEntries,
  emptyArchive,
  mergeArchive
};
