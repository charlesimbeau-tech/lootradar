# LootRadar Brand Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every public blue/cyan LootRadar brand remnant with one legible charcoal-and-mint radar identity and a complete favicon, app-icon, and social-preview family.

**Architecture:** Keep `icons/icon.svg` as the canonical vector mark and generate all raster derivatives deterministically with Sharp. Add one brand-contract test that scans every public page, the manifest, and generated assets so old colors or conflicting favicon declarations cannot return.

**Tech Stack:** Static HTML/CSS, Node.js 20+, Sharp, png-to-ico, Node's built-in test runner, GitHub Pages

## Global Constraints

- Use `#0a0d0c` for the icon background and `#b9f55d`/`#8fd838` for the primary mint mark.
- The mark must remain recognizable at 16, 32, and 48 pixels.
- Keep cyan only for semantic data visualization, never as the primary brand.
- Preserve the existing charcoal-and-mint site design and static-hosting architecture.
- Version all favicon references as `?v=2` to prompt cache refresh.
- Google may cache the old search favicon after deployment; do not promise an exact replacement time.

---

### Task 1: Add an enforceable brand contract

**Files:**
- Create: `tests/brand-assets.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: a repository-wide test for favicon declarations, raster dimensions, manifest purposes, social-preview dimensions, and retired colors.
- Produces: `npm run brand:build`.

- [ ] **Step 1: Install deterministic asset tooling**

Run:

```bash
npm install --save-dev sharp png-to-ico
```

Expected: `package.json` contains `sharp` and `png-to-ico` in `devDependencies`, and `package-lock.json` is updated.

- [ ] **Step 2: Write the failing brand tests**

Create `tests/brand-assets.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const pageRoots = [
  ...fs.readdirSync(root).filter(name => name.endsWith('.html')).map(name => path.join(root, name)),
  ...['blog', 'deals'].flatMap(directory =>
    fs.readdirSync(path.join(root, directory))
      .filter(name => name.endsWith('.html'))
      .map(name => path.join(root, directory, name))
  )
];

test('every public page declares the versioned favicon family', () => {
  for (const file of pageRoots) {
    const source = fs.readFileSync(file, 'utf8');
    const prefix = path.dirname(file) === root ? '' : '../';
    assert.match(source, new RegExp(`href="${prefix}icons/icon\\.svg\\?v=2"`), file);
    assert.match(source, new RegExp(`href="${prefix}icons/favicon-32\\.png\\?v=2"`), file);
    assert.match(source, new RegExp(`href="${prefix}icons/apple-touch-icon\\.png\\?v=2"`), file);
    assert.match(source, /name="theme-color" content="#0b0e0d"/, file);
  }
});

test('public branding does not retain the retired blue or cyan palette', () => {
  const files = [
    'icons/icon.svg', 'icons/logo.svg', 'recommendations.css', 'login.html',
    'manifest.json'
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /#30a9de|#30e5ff|#dce7ff|#bfe9ff/i, file);
  }
});

test('generated brand images have their declared dimensions', async () => {
  const expected = new Map([
    ['favicon-16.png', [16, 16]],
    ['favicon-32.png', [32, 32]],
    ['favicon-48.png', [48, 48]],
    ['apple-touch-icon.png', [180, 180]],
    ['icon-192.png', [192, 192]],
    ['icon-512.png', [512, 512]],
    ['icon-maskable-512.png', [512, 512]]
  ]);
  for (const [name, dimensions] of expected) {
    const metadata = await sharp(path.join(root, 'icons', name)).metadata();
    assert.deepEqual([metadata.width, metadata.height], dimensions, name);
  }
  const social = await sharp(path.join(root, 'public', 'og.png')).metadata();
  assert.deepEqual([social.width, social.height], [1200, 630]);
  assert.ok(fs.statSync(path.join(root, 'icons', 'favicon.ico')).size > 0);
});

test('manifest separates standard and maskable installed icons', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.ok(manifest.icons.some(icon => icon.src === 'icons/icon-192.png' && icon.purpose === 'any'));
  assert.ok(manifest.icons.some(icon => icon.src === 'icons/icon-512.png' && icon.purpose === 'any'));
  assert.ok(manifest.icons.some(icon => icon.src === 'icons/icon-maskable-512.png' && icon.purpose === 'maskable'));
});
```

- [ ] **Step 3: Add the generation command**

Add this script to `package.json`:

```json
"brand:build": "node scripts/generate-brand-assets.js"
```

- [ ] **Step 4: Run the test and verify the asset family is missing**

Run:

```bash
node --test tests/brand-assets.test.js
```

Expected: FAIL because the versioned metadata and generated files do not exist.

- [ ] **Step 5: Commit the failing contract**

```bash
git add package.json package-lock.json tests/brand-assets.test.js
git commit -m "test: define LootRadar brand asset contract"
```

### Task 2: Create the mint radar and generated asset family

**Files:**
- Modify: `icons/icon.svg`
- Modify: `icons/logo.svg`
- Create: `scripts/generate-brand-assets.js`
- Create: `icons/favicon-16.png`
- Create: `icons/favicon-32.png`
- Create: `icons/favicon-48.png`
- Create: `icons/favicon.ico`
- Create: `icons/apple-touch-icon.png`
- Create: `icons/icon-192.png`
- Create: `icons/icon-512.png`
- Create: `icons/icon-maskable-512.png`
- Modify: `icons/icon.png`
- Modify: `public/og.png`

**Interfaces:**
- Consumes: `icons/icon.svg` as the source vector.
- Produces: `generateBrandAssets() -> Promise<void>` and all declared raster files.

- [ ] **Step 1: Replace the canonical vector with the approved simple mark**

Use this complete content for `icons/icon.svg` and `icons/logo.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title">
  <title id="title">LootRadar radar mark</title>
  <rect width="512" height="512" rx="112" fill="#0a0d0c"/>
  <g fill="none" stroke="#b9f55d" stroke-width="28">
    <circle cx="256" cy="256" r="172"/>
    <circle cx="256" cy="256" r="104" opacity=".78"/>
    <path d="M256 256 377 135" stroke-linecap="round"/>
  </g>
  <circle cx="256" cy="256" r="18" fill="#b9f55d"/>
  <circle cx="351" cy="174" r="28" fill="#f5ffd9" stroke="#8fd838" stroke-width="12"/>
</svg>
```

- [ ] **Step 2: Add the deterministic generator**

Create `scripts/generate-brand-assets.js`:

```js
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

const root = path.resolve(__dirname, '..');
const icons = path.join(root, 'icons');

async function renderIcon(source, name, size, inset = 0) {
  const input = inset
    ? Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${size}" height="${size}" fill="#0a0d0c"/>
        <image href="data:image/svg+xml;base64,${source.toString('base64')}"
          x="${inset}" y="${inset}" width="${size - inset * 2}" height="${size - inset * 2}"/>
      </svg>`)
    : source;
  await sharp(input).resize(size, size).png().toFile(path.join(icons, name));
}

async function generateBrandAssets() {
  const source = await fs.readFile(path.join(icons, 'icon.svg'));
  for (const size of [16, 32, 48]) {
    await renderIcon(source, `favicon-${size}.png`, size);
  }
  await renderIcon(source, 'apple-touch-icon.png', 180);
  await renderIcon(source, 'icon-192.png', 192);
  await renderIcon(source, 'icon-512.png', 512);
  await renderIcon(source, 'icon-maskable-512.png', 512, 52);
  await renderIcon(source, 'icon.png', 512);

  const ico = await pngToIco([
    path.join(icons, 'favicon-16.png'),
    path.join(icons, 'favicon-32.png'),
    path.join(icons, 'favicon-48.png')
  ]);
  await fs.writeFile(path.join(icons, 'favicon.ico'), ico);

  const social = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="630" fill="#0a0d0c"/>
    <rect x="74" y="74" width="190" height="190" rx="42" fill="#111713"/>
    <image href="data:image/svg+xml;base64,${source.toString('base64')}" x="74" y="74" width="190" height="190"/>
    <text x="306" y="175" fill="#f4f6ef" font-family="Arial,sans-serif" font-size="88" font-weight="700">LootRadar</text>
    <text x="78" y="390" fill="#b9f55d" font-family="Arial,sans-serif" font-size="66" font-weight="700">Games worth playing.</text>
    <text x="78" y="478" fill="#f4f6ef" font-family="Arial,sans-serif" font-size="66" font-weight="700">Prices worth paying.</text>
    <text x="80" y="555" fill="#9ba59d" font-family="Arial,sans-serif" font-size="30">Quality-first PC game deals</text>
  </svg>`);
  await sharp(social).png().toFile(path.join(root, 'public', 'og.png'));
}

if (require.main === module) {
  generateBrandAssets().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { generateBrandAssets };
```

- [ ] **Step 3: Generate all assets**

Run:

```bash
npm run brand:build
```

Expected: all nine raster/ICO outputs exist and `public/og.png` is 1200×630.

- [ ] **Step 4: Inspect the three smallest icons and social card**

Open `icons/favicon-16.png`, `icons/favicon-32.png`, `icons/favicon-48.png`, and `public/og.png`.

Expected: the rings, sweep, and single bright dot remain distinct; no cyan or blue mark remains; social text is not clipped.

- [ ] **Step 5: Commit the asset family**

```bash
git add icons public/og.png scripts/generate-brand-assets.js
git commit -m "feat: create mint LootRadar brand assets"
```

### Task 3: Apply the brand contract to every public surface

**Files:**
- Modify: `manifest.json`
- Modify: `style.css`
- Modify: `recommendations.css`
- Modify: `index.html`
- Modify: `about.html`
- Modify: `blog.html`
- Modify: `games.html`
- Modify: `login.html`
- Modify: `methodology.html`
- Modify: `privacy.html`
- Modify: `recommendations.html`
- Modify: `terms.html`
- Modify: `blog/*.html`
- Modify: `scripts/templates/deal-landing.js`
- Modify: `scripts/verify-site.js`

**Interfaces:**
- Consumes: the Task 2 asset paths.
- Produces: one identical favicon declaration family at root and one `../`-relative family on nested pages.

- [ ] **Step 1: Replace each root-page favicon block**

Use this exact block in every root HTML document:

```html
<link rel="icon" href="icons/icon.svg?v=2" type="image/svg+xml">
<link rel="icon" href="icons/favicon-32.png?v=2" sizes="32x32" type="image/png">
<link rel="icon" href="icons/favicon.ico?v=2" sizes="any">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png?v=2">
<link rel="manifest" href="manifest.json">
<meta name="theme-color" content="#0b0e0d">
```

Use the same block with `../` before `icons/` and `manifest.json` in all `blog/*.html` pages and in `scripts/templates/deal-landing.js`. Then run:

```bash
node scripts/build-search-pages.js
```

Expected: all generated `deals/*.html` pages contain the nested version.

- [ ] **Step 2: Update the installed-app manifest**

Set `manifest.json` icons to:

```json
"icons": [
  { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

- [ ] **Step 3: Remove remaining blue-era UI colors**

In `login.html` and `recommendations.css`, replace retired blue values with:

```css
background: rgba(15, 23, 19, .78);
border-color: rgba(185, 245, 93, .24);
color: var(--text);
```

Use `var(--text-2)`, `var(--text-3)`, `var(--mint)`, and `var(--line)` for secondary text, messages, and borders. Preserve cyan only on existing chart/ring selectors that communicate data rather than branding.

- [ ] **Step 4: Extend production verification**

In `scripts/verify-site.js`, require the new icon files in both source and `dist/static`, require `?v=2` favicon blocks on every public HTML file, require `public/og.png`, and reject `#30a9de` or `#30e5ff` in `icons/*.svg`, `manifest.json`, `login.html`, and `recommendations.css`.

- [ ] **Step 5: Run the brand tests**

Run:

```bash
node --test tests/brand-assets.test.js
```

Expected: all brand tests pass.

- [ ] **Step 6: Commit public-surface updates**

```bash
git add manifest.json style.css recommendations.css *.html blog deals scripts/templates/deal-landing.js scripts/verify-site.js
git commit -m "feat: apply mint branding across LootRadar"
```

### Task 4: Validate, publish, and request recrawl

**Files:**
- Verify: all Task 1–3 files

**Interfaces:**
- Consumes: the complete brand release.
- Produces: a deployable static build and a cache-refresh request for the homepage.

- [ ] **Step 1: Run the complete validation pipeline**

Run:

```bash
npm test
npm run build
npm run verify
git diff --check
```

Expected: every command exits 0 and `dist/static/icons/` contains the complete generated family.

- [ ] **Step 2: Test locally at favicon size**

Run:

```bash
python -m http.server 4173
```

Expected: `/`, `/blog.html`, `/blog/game-price-comparison.html`, `/deals/`, `/games.html`, and `/recommendations.html` show the mint mark, dark mobile browser chrome, and no blue legacy branding.

- [ ] **Step 3: Push the independently deployable brand release**

```bash
git status --short
git pull --rebase origin main
git push origin main
```

Expected: `main` is synchronized with `origin/main`.

- [ ] **Step 4: Verify production and request a homepage recrawl**

Check `https://thelootradar.com/icons/icon.svg?v=2`, `favicon-32.png?v=2`, `favicon.ico?v=2`, `apple-touch-icon.png?v=2`, `manifest.json`, and `public/og.png`.

Expected: all return HTTP 200 with the mint assets. Submit `https://thelootradar.com/` for indexing in Google Search Console after those checks pass.
