'use strict';

const path = require('node:path');
const sharp = require('sharp');

const projectRoot = path.resolve(__dirname, '..', '..');
const outputDir = __dirname;
const backgroundPath = path.join(
  projectRoot,
  'marketing',
  'x-profile',
  'lootradar-x-header-background.png'
);
const logoPath = path.join(projectRoot, 'icons', 'logo.svg');
const generatedEmblemPath = path.join(
  outputDir,
  'lootradar-generated-emblem-source.png'
);

async function generate() {
  const logo = await sharp(logoPath)
    .resize(220, 220)
    .png()
    .toBuffer();

  const wordmark = Buffer.from(`
    <svg width="1130" height="270" viewBox="0 0 1130 270" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="9" flood-color="#000000" flood-opacity=".58"/>
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <text x="0" y="125" font-family="Manrope, Segoe UI, Arial, sans-serif" font-size="112" font-weight="800" letter-spacing="-6" fill="#f4f7f5">Loot<tspan fill="#b9f55d">Radar</tspan></text>
        <text x="7" y="193" font-family="DM Sans, Segoe UI, Arial, sans-serif" font-size="34" font-weight="600" letter-spacing="1" fill="#c7ceca">Games worth playing. Prices worth paying.</text>
        <rect x="7" y="226" width="148" height="6" rx="3" fill="#b9f55d"/>
        <text x="179" y="239" font-family="DM Sans, Segoe UI, Arial, sans-serif" font-size="23" font-weight="700" letter-spacing="4" fill="#8f9a94">QUALITY-FIRST PC GAME DEALS</text>
      </g>
    </svg>
  `);

  await sharp(backgroundPath)
    .resize(2560, 1440, { fit: 'cover', position: 'centre' })
    .modulate({ brightness: 0.82, saturation: 0.9 })
    .composite([
      { input: logo, left: 585, top: 610 },
      { input: wordmark, left: 845, top: 584 }
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(outputDir, 'lootradar-youtube-banner.png'));

  await sharp(generatedEmblemPath)
    .resize(800, 800)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(outputDir, 'lootradar-youtube-avatar-generated.png'));

  await sharp(generatedEmblemPath)
    .resize(150, 150)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(outputDir, 'lootradar-youtube-watermark-generated.png'));
}

generate().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
