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
