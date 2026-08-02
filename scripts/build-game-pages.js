'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildDealDataset } = require('../lib/deal-dataset.js');
const { createRecommendationReason } = require('../lib/deal-score.js');
const { gamePageRoute, selectGamePageDeals } = require('../lib/game-pages.js');
const { archiveEntries, emptyArchive, mergeArchive } = require('../lib/game-archive.js');
const config = require('../config/editorial-config.js');
const { renderGameHub, renderGamePage } = require('./templates/game-page.js');
const root = path.resolve(__dirname, '..');

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

const RELATED_COUNT = 4;

// Genre neighbours give crawlers a path into the long tail and give readers a
// reason to keep going. Falls back to score neighbours when genres are missing.
//
// Those links have to be spread rather than concentrated. Taking the top four
// by Deal Score pointed every page in a genre at the same four destinations, so
// a few pages collected hundreds of inbound links while 273 of 370 collected
// none at all. A page reachable only from the sitemap gets crawled rarely and
// ranks poorly, which defeats the point of publishing one page per game.
//
// So walk a deterministic ring instead: rank the neighbourhood, find where this
// deal sits, and link to the ones that follow it, wrapping at the end. Coverage
// spreads across the whole neighbourhood, and the ordering is stable, which
// matters because these pages rebuild eight times a day and churn shows up as
// git noise.
function relatedFor(deal, pool) {
  const genres = new Set(deal.genres || []);
  const others = pool.filter(item => item.key !== deal.key);
  const sameGenre = genres.size
    ? others.filter(item => (item.genres || []).some(genre => genres.has(genre)))
    : [];
  const neighbours = sameGenre.length >= RELATED_COUNT ? sameGenre : others;
  if (!neighbours.length) return [];

  // Rank with this deal included so its position in the ring is well defined.
  // Key breaks ties so equal scores cannot reorder between builds.
  const ring = [...neighbours, deal].sort(
    (a, b) => Number(b.dealScore) - Number(a.dealScore) ||
      String(a.key).localeCompare(String(b.key))
  );
  const start = ring.findIndex(item => item.key === deal.key);
  const picks = [];
  for (let step = 1; picks.length < RELATED_COUNT && step < ring.length; step += 1) {
    picks.push(ring[(start + step) % ring.length]);
  }
  return picks;
}
// The figures a reader would notice moving. The snapshot timestamp is
// deliberately absent: it changes daily on every page and says nothing about
// whether the offer did.
function pageSignature(entry) {
  return [
    entry.live ? 'live' : 'archived',
    entry.title,
    entry.storeName,
    entry.salePrice,
    entry.normalPrice,
    entry.discount,
    entry.dealScore,
    entry.userRating,
    entry.reviewCount,
    createRecommendationReason(entry)
  ].join('|');
}

function buildGamePages(options = {}) {
  const outputDir = path.resolve(options.outputDir || path.join(root, 'games'));
  const snapshot = options.snapshot || options.base || readJSON(path.join(root, 'deals.json'));
  const deals = options.deals || buildDealDataset(
    options.base || snapshot,
    options.enriched || readJSON(path.join(root, 'enriched-deals.json')),
    options.config || config
  );
  const selected = selectGamePageDeals(deals, options.limit);
  fs.mkdirSync(outputDir, { recursive: true });

  // A page has to outlive the sale that created it. Fold today's qualifiers
  // into the archive and render everything it holds, so a game whose discount
  // ended keeps its URL and switches to showing the last price we saw.
  // Keep the archive beside whatever is being written. Defaulting to the repo
  // copy whenever a caller passed only an outputDir would quietly mix the real
  // 300-odd entries into an isolated build, which is a trap for tests and for
  // anyone generating a preview elsewhere.
  const archivePath = options.archivePath
    || (options.outputDir
      ? path.join(outputDir, 'game-pages-archive.json')
      : path.join(root, 'game-pages-archive.json'));
  const storedArchive = options.archive
    || (fs.existsSync(archivePath) ? readJSON(archivePath) : emptyArchive());
  const archive = mergeArchive(storedArchive, selected, {
    now: snapshot.updatedAt,
    retentionDays: options.retentionDays,
    limit: options.archiveLimit
  });
  const pages = archiveEntries(archive)
    .filter(entry => gamePageRoute(entry))
    .sort((a, b) => {
      if (a.live !== b.live) return a.live ? -1 : 1;
      return Number(b.dealScore) - Number(a.dealScore) || String(a.key).localeCompare(String(b.key));
    });

  const keep = new Set(['index.html', ...pages.map(gamePageRoute)]);
  for (const file of fs.readdirSync(outputDir)) {
    if (file.endsWith('.html') && !keep.has(file)) fs.unlinkSync(path.join(outputDir, file));
  }

  // Rewriting a page whose content is byte-identical only creates git churn,
  // and these are regenerated eight times a day.
  let written = 0;
  const writeIfChanged = (file, contents) => {
    const target = path.join(outputDir, file);
    if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === contents) return false;
    fs.writeFileSync(target, contents);
    written += 1;
    return true;
  };

  // Link across the whole archive, not just today's live set. An archived page
  // with no inbound links is the orphan problem again by another route.
  const related = new Map(pages.map(entry => [entry.key, relatedFor(entry, pages)]));

  // The ring spreads links well but cannot promise every page is reached: a
  // deal in a thinly populated genre can sit outside everyone's window. Sweep
  // up whatever is left so "no page is reachable only from the sitemap" holds
  // as an invariant rather than as a tendency.
  const inbound = new Map(pages.map(entry => [entry.key, 0]));
  for (const picks of related.values()) {
    for (const pick of picks) inbound.set(pick.key, (inbound.get(pick.key) || 0) + 1);
  }
  const byKey = new Map(pages.map(entry => [entry.key, entry]));
  for (const [key, count] of inbound) {
    if (count > 0) continue;
    // Host it on the strongest page that is not this one and does not already
    // point here. pages is ordered live-first by Deal Score, so this favours
    // the pages most likely to be crawled often.
    const host = pages.find(candidate =>
      candidate.key !== key && !related.get(candidate.key).some(pick => pick.key === key)
    );
    if (host) related.get(host.key).push(byKey.get(key));
  }

  // The hub stays a list of what is actually discounted; an archived page is
  // worth keeping crawlable but not worth promoting as a live deal.
  writeIfChanged('index.html', renderGameHub(selected, snapshot));

  // Record when a page's substance changed, for the sitemap to report as
  // lastmod. Telling Google that every page changed on every refresh makes the
  // field worthless: it discounts lastmod it can show to be unreliable, and
  // re-crawls unchanged pages using budget the rest of the catalogue needs.
  //
  // Comparing rendered bytes does not work, because each page prints the
  // snapshot date and so differs once a day regardless of its price. Compare
  // the figures a reader would notice instead.
  const changedAt = archive.updatedAt;
  for (const entry of pages) {
    const html = renderGamePage(entry, snapshot, related.get(entry.key));
    writeIfChanged(gamePageRoute(entry), html);
    const stored = archive.games[entry.key];
    if (!stored) continue;
    const signature = pageSignature(entry);
    if (stored.contentSignature !== signature || !stored.contentChangedAt) {
      stored.contentSignature = signature;
      stored.contentChangedAt = changedAt;
    }
  }

  if (!options.skipArchiveWrite) {
    fs.writeFileSync(archivePath, `${JSON.stringify(archive, null, 2)}\n`);
  }

  return {
    outputDir,
    selected,
    pages,
    archive,
    written,
    live: pages.filter(entry => entry.live).length,
    archived: pages.filter(entry => !entry.live).length,
    routes: ['index.html', ...pages.map(gamePageRoute)]
  };
}

if (require.main === module) {
  const result = buildGamePages();
  console.log(
    `Generated ${result.routes.length - 1} game price checks: ${result.live} discounted now, ` +
    `${result.archived} kept from earlier sweeps (${result.written} files written).`
  );
}
module.exports = { buildGamePages };
