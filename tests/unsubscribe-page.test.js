const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('unsubscribe.html', 'utf8');
const script = fs.readFileSync('unsubscribe.js', 'utf8');

test('unsubscribe confirmation is private, allow-listed, and text-only', () => {
  assert.match(html, /name="robots" content="noindex,follow"/);
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
  assert.match(script, /\.textContent\s*=/);
  for (const category of ['target_price', 'free_game', 'weekly_digest', 'all']) {
    assert.ok(script.includes(category));
  }
  assert.doesNotMatch(script, /user[_-]?id/i);
});
