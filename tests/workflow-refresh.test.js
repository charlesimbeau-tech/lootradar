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
