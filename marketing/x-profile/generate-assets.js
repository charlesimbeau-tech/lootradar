'use strict';

const path = require('node:path');
const sharp = require('sharp');

const projectRoot = path.resolve(__dirname, '..', '..');
const outputDir = __dirname;
const backgroundPath = path.join(outputDir, 'lootradar-x-header-background.png');
const logoPath = path.join(projectRoot, 'icons', 'logo.svg');

async function generate() {
  const logo = await sharp(logoPath)
    .resize(176, 176)
    .png()
    .toBuffer();

  const wordmark = Buffer.from(`
    <svg width="900" height="220" viewBox="0 0 900 220" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="7" flood-color="#000000" flood-opacity=".55"/>
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <text x="0" y="104" font-family="Manrope, Segoe UI, Arial, sans-serif" font-size="92" font-weight="800" letter-spacing="-5" fill="#f4f7f5">Loot<tspan fill="#b9f55d">Radar</tspan></text>
        <text x="5" y="160" font-family="DM Sans, Segoe UI, Arial, sans-serif" font-size="27" font-weight="600" letter-spacing=".8" fill="#c7ceca">Games worth playing. Prices worth paying.</text>
        <rect x="5" y="188" width="118" height="5" rx="2.5" fill="#b9f55d"/>
        <text x="142" y="198" font-family="DM Sans, Segoe UI, Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="3" fill="#8f9a94">QUALITY-FIRST PC GAME DEALS</text>
      </g>
    </svg>
  `);

  await sharp(backgroundPath)
    .resize(1500, 500, { fit: 'cover', position: 'centre' })
    .composite([
      { input: logo, left: 338, top: 162 },
      { input: wordmark, left: 548, top: 142 }
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(outputDir, 'lootradar-x-header.png'));

  await sharp(logoPath)
    .resize(400, 400)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(outputDir, 'lootradar-x-avatar.png'));
}

generate().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
