const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('the refresh workflow stages every generated catalog before rebasing', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'update-deals.yml'),
    'utf8'
  );

  assert.match(
    workflow,
    /git add games-catalog-large\.json/,
    'build-games-catalog-large.js modifies games-catalog-large.json, so the workflow must stage it before git pull --rebase'
  );
});
test('the refresh workflow rebuilds and stages permanent game pages', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'update-deals.yml'),
    'utf8'
  );
  const gamesBuild = workflow.indexOf('node scripts/build-game-pages.js');
  const guideBuild = workflow.indexOf('node scripts/build-guide-deal-modules.js');
  const searchBuild = workflow.indexOf('node scripts/build-search-pages.js');
  const sitemapBuild = workflow.indexOf('node scripts/generate-sitemap.js');
  assert.ok(gamesBuild > -1);
  assert.ok(gamesBuild < searchBuild);
  assert.ok(gamesBuild < guideBuild);
  assert.ok(guideBuild < searchBuild);
  assert.ok(searchBuild < sitemapBuild);
  assert.match(workflow, /\[ -d games \] && git add games/);
  assert.match(workflow, /git add blog\/are-90-percent-discounts-good\.html/);
});


test('the refresh workflow keeps each named step attached to a command', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'update-deals.yml'),
    'utf8'
  );
  assert.doesNotMatch(workflow, /- name:[^\r\n]+\r?\n\s+- name:/);
  assert.match(workflow, /- name: Refresh guide evidence modules\r?\n\s+run: node scripts\/build-guide-deal-modules\.js/);
});


test('the refresh workflow limits automated CheapShark pressure', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'update-deals.yml'),
    'utf8'
  );

  assert.match(workflow, /cron: '17 \*\/3 \* \* \*'/);
  assert.doesNotMatch(workflow, /cron: '0 \* \* \* \*'/);
  assert.match(workflow, /actions\/checkout@v5/);
  assert.match(workflow, /actions\/setup-node@v6/);
  assert.match(workflow, /node-version: '24'/);
});

test('paging cannot outgrow the request budget', () => {
  // On 2026-07-30 a deeper paging setting was published without checking it
  // against the budget, CheapShark rate limited the runner for an hour, and 8
  // of 14 stores were lost from that refresh. This is the arithmetic that was
  // missing. \b anchors matter: PAGES_PER_STORE also appears inside
  // MAX_PAGES_PER_STORE and RECENT_PAGES_PER_STORE.
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'update-deals.yml'),
    'utf8'
  );
  const setting = name => {
    const match = workflow.match(new RegExp(`\\b${name}:\\s*(\\d+)`));
    assert.ok(match, `${name} must be set in the refresh workflow`);
    return Number(match[1]);
  };

  const floor = setting('PAGES_PER_STORE');
  const ceiling = setting('MAX_PAGES_PER_STORE');
  const recent = setting('RECENT_PAGES_PER_STORE');
  const budget = setting('MAX_REQUESTS');

  assert.ok(
    ceiling >= floor,
    'MAX_PAGES_PER_STORE below PAGES_PER_STORE would make the guaranteed floor a lie'
  );

  // Equal values silently disable adaptive paging: the yield gate in
  // fetch-deals.js only fires once page + 1 >= PAGES_PER_STORE, so with no gap
  // it can never run and every store is truncated at the same depth.
  assert.ok(
    ceiling > floor,
    'MAX_PAGES_PER_STORE must exceed PAGES_PER_STORE or the adaptive yield gate can never fire'
  );

  const stores = Number(require('../deals.json').storeCount) || 14;
  const worstCase = stores * (ceiling + recent);
  assert.ok(
    worstCase <= budget,
    `worst-case ${worstCase} requests (${stores} stores x ${ceiling}+${recent} pages) exceeds MAX_REQUESTS ${budget}`
  );
});

test('the refresh script retries safely and validates before publishing', () => {
  const script = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'fetch-deals.js'),
    'utf8'
  );

  assert.match(script, /createCheapSharkClient/);
  assert.match(script, /validateSnapshot\(output, previousSnapshot, failedStores\)/);
  assert.ok(
    script.indexOf('validateSnapshot(output, previousSnapshot, failedStores)') <
      script.indexOf('fs.writeFileSync(outPath'),
    'snapshot validation must happen before deals.json is overwritten'
  );
});

test('visitor CheapShark lookups use the shared cached client', () => {
  const homepage = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const games = fs.readFileSync(path.join(__dirname, '..', 'games.html'), 'utf8');

  assert.match(homepage, /lib\/cheapshark-client\.js/);
  assert.match(app, /cheapShark\.get/);
  assert.match(games, /lib\/cheapshark-client\.js/);
  assert.match(games, /cacheKey: `search:/);
  assert.match(games, /searchController\.abort\(\)/);
  assert.doesNotMatch(games, /await fetch\(`\$\{API\}\//);
});
