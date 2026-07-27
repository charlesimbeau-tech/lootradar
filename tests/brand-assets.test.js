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
