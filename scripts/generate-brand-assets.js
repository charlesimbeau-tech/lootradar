const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

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
  const { default: pngToIco } = await import('png-to-ico');
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
  await fs.writeFile(path.join(root, 'favicon.ico'), ico);

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
