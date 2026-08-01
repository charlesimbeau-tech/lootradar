const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

class FakeLink {
  constructor(href, text = 'Sign in') {
    this.attributes = new Map([['href', href]]);
    this.textContent = text;
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
}

function fakeDocument(links) {
  return {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-account-link]');
      return links;
    }
  };
}

test('each browser page reuses one Supabase client', () => {
  const { clientFor } = require('../lib/auth-nav.js');
  let created = 0;
  const browser = {
    LR_SUPABASE_URL: 'https://example.supabase.co',
    LR_SUPABASE_ANON_KEY: 'public-key',
    supabase: {
      createClient(url, key) {
        created += 1;
        return { url, key, auth: { getSession() {} } };
      }
    }
  };

  const first = clientFor(browser);
  const second = clientFor(browser);

  assert.equal(first, second);
  assert.equal(created, 1);
  assert.equal(clientFor({}), null);
});

test('authenticated sessions upgrade every root and nested account link', async () => {
  const { updateAuthNavigation } = require('../lib/auth-nav.js');
  const links = [
    new FakeLink('login.html'),
    new FakeLink('../login.html'),
    new FakeLink('login.html?next=/recommendations.html')
  ];

  const result = await updateAuthNavigation({
    client: {
      auth: {
        async getSession() {
          return { data: { session: { user: { id: 'private' } } }, error: null };
        }
      }
    },
    document: fakeDocument(links),
    timeoutMs: 20
  });

  assert.equal(result, 'authenticated');
  assert.deepEqual(
    links.map(link => [link.textContent, link.getAttribute('href')]),
    [
      ['My account', 'account.html'],
      ['My account', '../account.html'],
      ['My account', 'account.html']
    ]
  );
});

test('guest, error, and timeout states retain the original guest links', async () => {
  const { updateAuthNavigation } = require('../lib/auth-nav.js');

  for (const getSession of [
    async () => ({ data: { session: null }, error: null }),
    async () => ({ data: { session: null }, error: new Error('private detail') }),
    async () => {
      throw new Error('private detail');
    },
    async () => new Promise(() => {})
  ]) {
    const link = new FakeLink('../login.html');
    const result = await updateAuthNavigation({
      client: { auth: { getSession } },
      document: fakeDocument([link]),
      timeoutMs: 5
    });

    assert.equal(result, 'guest');
    assert.equal(link.textContent, 'Sign in');
    assert.equal(link.getAttribute('href'), '../login.html');
  }
});

test('public navigation loads the shared helper with correct relative paths', () => {
  const rootPages = [
    'index.html',
    'games.html',
    'recommendations.html',
    'methodology.html',
    'about.html',
    'blog.html',
    'login.html'
  ];
  const nestedPages = [
    ...fs.readdirSync(path.join(root, 'blog'))
      .filter(name => name.endsWith('.html'))
      .map(name => path.join('blog', name)),
    ...fs.readdirSync(path.join(root, 'deals'))
      .filter(name => name.endsWith('.html'))
      .map(name => path.join('deals', name))
  ];

  for (const [pages, prefix] of [[rootPages, ''], [nestedPages, '../']]) {
    for (const relativePath of pages) {
      const html = fs.readFileSync(path.join(root, relativePath), 'utf8');
      assert.match(
        html,
        new RegExp(`<a[^>]*data-account-link[^>]*href="${prefix}login\\.html"[^>]*>Sign in</a>`),
        `${relativePath} has a guest-first account link`
      );
      assert.match(html, /@supabase\/supabase-js@2/, `${relativePath} loads Supabase`);
      assert.match(
        html,
        new RegExp(`<script src="${prefix}supabase-config\\.js"></script>`),
        `${relativePath} loads public Supabase config`
      );
      assert.match(
        html,
        new RegExp(`<script src="${prefix}lib/auth-nav\\.js\\?v=\\d+"></script>`),
        `${relativePath} loads the auth-navigation helper`
      );
    }
  }
});

test('account setup documentation names the exact production controls and no service-role key', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const env = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  const workflow = fs.readFileSync(
    path.join(root, '.github', 'workflows', 'sync-supabase-config.yml'),
    'utf8'
  );

  for (const text of [
    'Google provider',
    'https://thelootradar.com',
    'https://thelootradar.com/login.html',
    'Manual identity linking',
    'db/supabase-recommendations.sql',
    'delete-account'
  ]) {
    assert.ok(readme.includes(text), `README documents ${text}`);
  }
  assert.match(readme, /Google client ID and client secret/i);
  assert.match(readme, /Site URL/i);
  assert.match(readme, /Redirect allowlist/i);
  assert.doesNotMatch(env, /SERVICE_ROLE/i);
  assert.doesNotMatch(workflow, /SERVICE_ROLE/i);
  assert.match(workflow, /LR_SUPABASE_URL/);
  assert.match(workflow, /LR_SUPABASE_ANON_KEY/);
  assert.match(env, /LR_ALERTS_ENABLED=false/);
  assert.match(workflow, /vars\.LR_ALERTS_ENABLED \|\| 'false'/);
  assert.match(workflow, /window\.LR_ALERTS_ENABLED = \$\{LR_ALERTS_ENABLED\}/);
  assert.match(readme, /Leave it unset or `false` until the Resend sending domain/i);
});

test('about copy explains optional private accounts and default-off email preferences', () => {
  const about = fs.readFileSync(path.join(root, 'about.html'), 'utf8');
  assert.match(about, /accounts? (?:are|remain) optional/i);
  assert.match(about, /private/i);
  assert.match(about, /Google/i);
  assert.match(about, /passwordless email/i);
  assert.match(about, /watchlist/i);
  assert.match(about, /(?:default[^<.]*off|off[^<.]*default)/i);
  assert.match(about, /delete/i);
});
