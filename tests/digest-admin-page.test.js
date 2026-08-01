const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'digest-admin.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'digest-admin.js'), 'utf8');

test('digest admin page is private, session-backed, and has explicit preview/send controls', () => {
  assert.match(html, /name="robots" content="noindex,nofollow"/);
  assert.match(html, /id="previewDigest"/);
  assert.match(html, /id="sendTestDigest"[^>]*disabled/);
  assert.match(script, /LootRadarAuthNav\.clientFor\(window\)/);
  assert.match(script, /\.functions\.invoke\('digest-admin'/);
  assert.match(script, /invoke\('preview'\)/);
  assert.match(script, /invoke\('send_test'\)/);
  assert.match(script, /window\.confirm/);
});

test('digest admin renders response values through text nodes without browser credentials', () => {
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
  assert.match(script, /\.textContent\s*=/);
  assert.match(script, /createElement\('li'\)/);
  assert.doesNotMatch(html + script, /SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|DIGEST_ADMIN_USER_IDS/);
});
