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
  const searchBuild = workflow.indexOf('node scripts/build-search-pages.js');
  const sitemapBuild = workflow.indexOf('node scripts/generate-sitemap.js');
  assert.ok(gamesBuild > -1);
  assert.ok(gamesBuild < searchBuild);
  assert.ok(searchBuild < sitemapBuild);
  assert.match(workflow, /\[ -d games \] && git add games/);
  // The evergreen guides were removed, so the refresh no longer rebuilds or
  // stages them. Nothing should reintroduce a step for a script that is gone.
  assert.doesNotMatch(workflow, /build-guide-deal-modules/);
  assert.doesNotMatch(workflow, /git add blog\//);
});


test('the refresh workflow keeps each named step attached to a command', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'update-deals.yml'),
    'utf8'
  );
  assert.doesNotMatch(workflow, /- name:[^\r\n]+\r?\n\s+- name:/);
  // The original guard named one specific step. Removing that step broke it,
  // which is the wrong failure: the property worth holding is that no step is
  // ever left without a command, whichever steps exist.
  const steps = [...workflow.matchAll(/- name: ([^\r\n]+)/g)].map(match => match[1]);
  assert.ok(steps.length > 5, 'expected the refresh to have several named steps');
  for (const step of steps) {
    const after = workflow.slice(workflow.indexOf(`- name: ${step}`) + step.length);
    assert.match(
      after.slice(0, 400),
      /\n\s+(run:|uses:|env:)/,
      `step "${step}" has no command attached`
    );
  }
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

test('the refresh checkout has enough history to rebase a dispatched branch', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'update-deals.yml'),
    'utf8'
  );

  assert.match(
    workflow,
    /uses: actions\/checkout@v5\r?\n\s+with:\r?\n(?:\s+#[^\r\n]*\r?\n)*\s+fetch-depth: 0/,
    'a shallow checkout makes git pull --rebase origin main see unrelated histories'
  );
});

test('the refresh workflow stages the game page archive', () => {
  // The archive is what keeps a game page alive after its discount ends. If the
  // workflow does not commit it, every run starts from empty, expired pages are
  // deleted again, and their URLs go back to 404.
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'update-deals.yml'),
    'utf8'
  );
  assert.match(workflow, /git add game-pages-archive\.json/);
});

test('paging cannot outgrow the request budget', () => {
  // On 2026-07-30 a deeper paging setting was published without checking it
  // against the budget, CheapShark rate limited the runner for an hour, and 8
  // of 14 stores were lost from that refresh. This is the arithmetic that was
  // missing. \b anchors matter because PAGES_PER_STORE also appears inside
  // MAX_PAGES_PER_STORE.
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
  const recent = setting('GLOBAL_RECENT_PAGES');
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
  const mandatory = 1 + stores * floor + recent;
  assert.ok(
    mandatory <= budget,
    `mandatory ${mandatory} requests (store list + ${stores} stores x ${floor} pages + ${recent} recent pages) exceeds MAX_REQUESTS ${budget}`
  );

  // The candidate depth intentionally exceeds the budget. That lets productive
  // stores use calls surrendered by sparse stores while MAX_REQUESTS remains the
  // hard cap across the whole run.
  const candidateDepth = 1 + stores * ceiling + recent;
  assert.ok(
    candidateDepth > budget,
    `candidate depth ${candidateDepth} should exercise the global request cap ${budget}`
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
