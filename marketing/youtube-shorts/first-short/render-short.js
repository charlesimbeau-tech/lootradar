'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');

const WIDTH = 1080;
const HEIGHT = 1920;
const LIME = '#b9f55d';
const LIME_DARK = '#8fd838';
const INK = '#090c0b';
const PANEL = '#121815';
const WHITE = '#f4f7f5';
const MUTED = '#aeb8b2';
const FONT = 'Segoe UI, Arial, sans-serif';

const outputDir = __dirname;
const generatedDir = path.join(outputDir, 'generated');
const artDir = path.join(generatedDir, 'art');
const sceneDir = path.join(generatedDir, 'scenes');
const snapshotPath = path.join(outputDir, 'deals-2026-07-29.json');
const narrationPath = path.join(outputDir, 'lootradar-first-short-narration-scout.mp3');
const outputPath = path.join(outputDir, 'lootradar-first-short-scout.mp4');
const logoPath = path.resolve(outputDir, '..', '..', 'youtube-profile', 'lootradar-generated-emblem-source.png');

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

fs.mkdirSync(artDir, { recursive: true });
fs.mkdirSync(sceneDir, { recursive: true });

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function formatCount(count) {
  if (count >= 100000) return `${(count / 1000).toFixed(1)}k`;
  if (count >= 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

function brandHeader(kicker) {
  return `
    <g>
      <circle cx="102" cy="102" r="34" fill="none" stroke="${LIME}" stroke-width="6"/>
      <circle cx="102" cy="102" r="18" fill="none" stroke="${LIME}" stroke-width="5" opacity=".78"/>
      <path d="M102 102 L128 76" stroke="${LIME}" stroke-width="6" stroke-linecap="round"/>
      <circle cx="127" cy="77" r="6" fill="${WHITE}"/>
      <text x="158" y="92" fill="${WHITE}" font-family="${FONT}" font-size="38" font-weight="800" letter-spacing="-1">Loot<tspan fill="${LIME}">Radar</tspan></text>
      <text x="158" y="126" fill="${MUTED}" font-family="${FONT}" font-size="19" font-weight="700" letter-spacing="3">${escapeXml(kicker)}</text>
      <line x1="72" y1="162" x2="1008" y2="162" stroke="#26302b" stroke-width="2"/>
    </g>
  `;
}

function captionBand(lines, accent = false) {
  const spans = lines.map((line, index) =>
    `<tspan x="96" dy="${index === 0 ? 0 : 62}"${accent && index === lines.length - 1 ? ` fill="${LIME}"` : ''}>${escapeXml(line)}</tspan>`
  ).join('');

  return `
    <rect x="72" y="1626" width="936" height="212" rx="34" fill="#101512" stroke="#2b3731" stroke-width="2"/>
    <rect x="72" y="1626" width="10" height="212" rx="5" fill="${LIME}"/>
    <text x="96" y="1698" fill="${WHITE}" font-family="${FONT}" font-size="45" font-weight="800" letter-spacing="-1">${spans}</text>
  `;
}

function radarDecoration() {
  return `
    <g fill="none" stroke="${LIME}" opacity=".15">
      <circle cx="875" cy="1210" r="320" stroke-width="4"/>
      <circle cx="875" cy="1210" r="230" stroke-width="4"/>
      <circle cx="875" cy="1210" r="138" stroke-width="4"/>
      <path d="M875 1210 L1075 1010" stroke-width="5"/>
    </g>
  `;
}

function sceneSvg(body, extra = '', includeBackground = true) {
  return Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="glow" cx="78%" cy="8%" r="70%">
          <stop offset="0" stop-color="#2b4620" stop-opacity=".55"/>
          <stop offset=".5" stop-color="#101612" stop-opacity=".22"/>
          <stop offset="1" stop-color="${INK}" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${INK}" stop-opacity=".08"/>
          <stop offset=".55" stop-color="${INK}" stop-opacity=".4"/>
          <stop offset="1" stop-color="${INK}" stop-opacity=".98"/>
        </linearGradient>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="18" stdDeviation="25" flood-color="#000000" flood-opacity=".52"/>
        </filter>
      </defs>
      ${includeBackground ? `<rect width="${WIDTH}" height="${HEIGHT}" fill="${INK}"/><rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>` : ''}
      ${extra}
      ${body}
    </svg>
  `);
}

async function saveSvgScene(filename, svg) {
  const target = path.join(sceneDir, filename);
  await sharp(svg).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(target);
  return target;
}

async function downloadArtwork(deal) {
  const target = path.join(artDir, `${deal.steamAppId}-header.jpg`);
  if (fs.existsSync(target) && fs.statSync(target).size > 10000) return target;

  const response = await fetch(deal.headerImage, {
    headers: {
      'User-Agent': 'LootRadar-Producer/1.0 (contact@thelootradar.com)'
    }
  });
  if (!response.ok) {
    throw new Error(`Artwork download failed for ${deal.title}: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(target, buffer);
  return target;
}

async function buildHook() {
  const body = `
    ${brandHeader('QUALITY-FIRST PC GAME DEALS')}
    ${radarDecoration()}
    <text x="72" y="366" fill="${MUTED}" font-family="${FONT}" font-size="28" font-weight="800" letter-spacing="5">THE DISCOUNT IS NOT THE VERDICT</text>
    <text x="72" y="520" fill="${WHITE}" font-family="${FONT}" font-size="108" font-weight="900" letter-spacing="-6">
      <tspan x="72">STOP BUYING</tspan>
      <tspan x="72" dy="112">THE BADGE.</tspan>
    </text>
    <g filter="url(#shadow)">
      <rect x="72" y="825" width="430" height="300" rx="42" fill="#171d1a" stroke="#343e39" stroke-width="3"/>
      <text x="287" y="935" fill="#748078" text-anchor="middle" font-family="${FONT}" font-size="32" font-weight="700">MASSIVE DISCOUNT</text>
      <text x="287" y="1049" fill="${WHITE}" text-anchor="middle" font-family="${FONT}" font-size="92" font-weight="900">90% OFF</text>
      <path d="M117 866 L458 1082" stroke="#ef7069" stroke-width="14" stroke-linecap="round"/>
    </g>
    <g transform="translate(560 825)" filter="url(#shadow)">
      <rect width="448" height="300" rx="42" fill="#182318" stroke="${LIME_DARK}" stroke-width="3"/>
      <text x="224" y="110" fill="${LIME}" text-anchor="middle" font-family="${FONT}" font-size="32" font-weight="800">WORTH PLAYING?</text>
      <circle cx="224" cy="207" r="48" fill="${LIME}"/>
      <path d="M203 208 L220 225 L249 187" fill="none" stroke="${INK}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    ${captionBand(['Stop buying games just because', 'they are ninety percent off.'], true)}
  `;
  return saveSvgScene('01-hook.png', sceneSvg(body));
}

async function buildMethod() {
  const metrics = [
    { x: 72, label: 'QUALITY', big: 'Reviews', small: 'What players think' },
    { x: 386, label: 'VALUE', big: 'Price', small: 'What you actually pay' },
    { x: 700, label: 'CONFIDENCE', big: 'Volume', small: 'How much evidence' }
  ];
  const cards = metrics.map((metric, index) => `
    <g transform="translate(${metric.x} 650)" filter="url(#shadow)">
      <rect width="308" height="490" rx="38" fill="${index === 1 ? '#182318' : PANEL}" stroke="${index === 1 ? LIME_DARK : '#303a35'}" stroke-width="3"/>
      <circle cx="154" cy="102" r="58" fill="${index === 1 ? LIME : '#202a25'}"/>
      <text x="154" y="121" fill="${index === 1 ? INK : LIME}" text-anchor="middle" font-family="${FONT}" font-size="47" font-weight="900">${index + 1}</text>
      <text x="154" y="229" fill="${LIME}" text-anchor="middle" font-family="${FONT}" font-size="21" font-weight="900" letter-spacing="3">${metric.label}</text>
      <text x="154" y="305" fill="${WHITE}" text-anchor="middle" font-family="${FONT}" font-size="44" font-weight="900">${metric.big}</text>
      <text x="154" y="385" fill="${MUTED}" text-anchor="middle" font-family="${FONT}" font-size="24" font-weight="600">${metric.small}</text>
      <rect x="67" y="435" width="174" height="7" rx="4" fill="${LIME}" opacity="${index === 1 ? 1 : .45}"/>
    </g>
  `).join('');

  const body = `
    ${brandHeader('HOW WE CHOOSE')}
    <text x="72" y="354" fill="${WHITE}" font-family="${FONT}" font-size="95" font-weight="900" letter-spacing="-5">
      <tspan x="72">THREE SIGNALS.</tspan>
      <tspan x="72" dy="102" fill="${LIME}">ONE BETTER PICK.</tspan>
    </text>
    ${cards}
    ${captionBand(['Quality. Value. Review confidence.', 'The discount never decides alone.'], true)}
  `;
  return saveSvgScene('02-method.png', sceneSvg(body));
}

async function roundedArtwork(artPath) {
  const image = await sharp(artPath)
    .resize(936, 510, { fit: 'cover', position: 'centre' })
    .modulate({ brightness: 0.85, saturation: 1.05 })
    .png()
    .toBuffer();
  const mask = Buffer.from(`
    <svg width="936" height="510" xmlns="http://www.w3.org/2000/svg">
      <rect width="936" height="510" rx="42" fill="#fff"/>
    </svg>
  `);
  return sharp(image)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function buildDealScene(deal, index, artPath) {
  const art = await roundedArtwork(artPath);
  const artLayer = await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: art, left: 72, top: 238 }])
    .png()
    .toBuffer();

  const body = `
    ${brandHeader(`TODAY'S PICK 0${index}`)}
    <rect x="72" y="238" width="936" height="510" rx="42" fill="none" stroke="#38433d" stroke-width="3"/>
    <rect x="72" y="238" width="936" height="510" rx="42" fill="url(#fade)"/>
    <rect x="96" y="270" width="150" height="58" rx="29" fill="${LIME}"/>
    <text x="171" y="310" fill="${INK}" text-anchor="middle" font-family="${FONT}" font-size="25" font-weight="900">SAVE ${deal.savingsPercent}%</text>
    <text x="72" y="868" fill="${LIME}" font-family="${FONT}" font-size="25" font-weight="900" letter-spacing="4">${escapeXml(deal.storeName.toUpperCase())}</text>
    <text x="72" y="963" fill="${WHITE}" font-family="${FONT}" font-size="${deal.displayTitle.length > 15 ? 70 : 82}" font-weight="900" letter-spacing="-3">${escapeXml(deal.displayTitle)}</text>
    <g transform="translate(72 1020)">
      <text x="0" y="120" fill="${LIME}" font-family="${FONT}" font-size="126" font-weight="900" letter-spacing="-6">$${deal.salePrice.toFixed(2)}</text>
      <text x="430" y="85" fill="${MUTED}" font-family="${FONT}" font-size="43" font-weight="700">$${deal.normalPrice.toFixed(2)}</text>
      <line x1="424" y1="70" x2="582" y2="70" stroke="#ef7069" stroke-width="7" stroke-linecap="round"/>
    </g>
    <g transform="translate(72 1218)">
      <rect width="445" height="240" rx="34" fill="${PANEL}" stroke="#303a35" stroke-width="3"/>
      <text x="32" y="58" fill="${MUTED}" font-family="${FONT}" font-size="23" font-weight="800" letter-spacing="2">PLAYER REVIEWS</text>
      <text x="32" y="139" fill="${WHITE}" font-family="${FONT}" font-size="67" font-weight="900">${deal.steamRatingPercent}%</text>
      <text x="32" y="194" fill="${LIME}" font-family="${FONT}" font-size="25" font-weight="700">${formatCount(deal.steamRatingCount)} reviews</text>
      <rect x="492" width="444" height="240" rx="34" fill="#182318" stroke="${LIME_DARK}" stroke-width="3"/>
      <text x="524" y="58" fill="${MUTED}" font-family="${FONT}" font-size="23" font-weight="800" letter-spacing="2">CRITIC SCORE</text>
      <text x="524" y="151" fill="${LIME}" font-family="${FONT}" font-size="78" font-weight="900">${deal.metacriticScore}</text>
      <text x="524" y="199" fill="${WHITE}" font-family="${FONT}" font-size="25" font-weight="700">Quality signal</text>
    </g>
    <text x="72" y="1570" fill="${WHITE}" font-family="${FONT}" font-size="34" font-weight="800">HIGH QUALITY <tspan fill="${LIME}">+</tspan> LOW PRICE <tspan fill="${LIME}">+</tspan> REAL REVIEW DEPTH</text>
    ${captionBand(index === 1
      ? ['Three current deals that are', 'actually worth a closer look.']
      : index === 2
        ? ['Strong reviews. A real audience.', 'A price worth noticing.']
        : ['The numbers support the discount.', 'That is the LootRadar difference.'], true)}
    <text x="72" y="1880" fill="#77827b" font-family="${FONT}" font-size="22" font-weight="600">${escapeXml(snapshot.disclaimer)}</text>
  `;

  const svg = sceneSvg(body, '', false);
  const target = path.join(sceneDir, `0${index + 2}-${deal.steamAppId}.png`);
  await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: INK
    }
  })
    .composite([
      { input: artLayer, left: 0, top: 0 },
      { input: svg, left: 0, top: 0 }
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(target);
  return target;
}

async function buildCta() {
  const logo = await sharp(logoPath)
    .resize(360, 360, { fit: 'contain' })
    .png()
    .toBuffer();

  const body = `
    ${radarDecoration()}
    <text x="540" y="690" fill="${WHITE}" text-anchor="middle" font-family="${FONT}" font-size="104" font-weight="900" letter-spacing="-5">BUY BETTER.</text>
    <text x="540" y="798" fill="${LIME}" text-anchor="middle" font-family="${FONT}" font-size="104" font-weight="900" letter-spacing="-5">PLAY BETTER.</text>
    <text x="540" y="940" fill="${MUTED}" text-anchor="middle" font-family="${FONT}" font-size="33" font-weight="700">Today&apos;s quality-first PC game deals</text>
    <g filter="url(#shadow)">
      <rect x="146" y="1030" width="788" height="136" rx="68" fill="${LIME}"/>
      <text x="540" y="1116" fill="${INK}" text-anchor="middle" font-family="${FONT}" font-size="48" font-weight="900">THELOOTRADAR.COM</text>
    </g>
    <text x="540" y="1258" fill="${WHITE}" text-anchor="middle" font-family="${FONT}" font-size="31" font-weight="800">LINK ON OUR CHANNEL</text>
    ${captionBand(['Find today’s best picks', 'at the link on our channel.'], true)}
    <text x="540" y="1880" fill="#77827b" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="600">${escapeXml(snapshot.disclaimer)}</text>
  `;
  const svg = sceneSvg(body, '', false);
  const target = path.join(sceneDir, '06-cta.png');
  await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: INK
    }
  })
    .composite([
      { input: logo, left: 360, top: 235 },
      { input: svg, left: 0, top: 0 }
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(target);
  return target;
}

function renderVideo(scenePaths) {
  const durations = [3.20, 2.30, 2.10, 1.90, 1.90, 2.41875];
  const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
  const args = ['-y'];
  for (let index = 0; index < scenePaths.length; index += 1) {
    args.push('-loop', '1', '-framerate', '30', '-t', String(durations[index]), '-i', scenePaths[index]);
  }
  args.push('-i', narrationPath);

  const filters = scenePaths.map((_, index) => (
    `[${index}:v]scale=1120:1992,crop=1080:1920:x='20+12*sin(t*0.55+${index})':y='36+10*cos(t*0.45+${index})',` +
    `fps=30,trim=duration=${durations[index]},setpts=PTS-STARTPTS[v${index}]`
  ));
  filters.push(
    `${scenePaths.map((_, index) => `[v${index}]`).join('')}concat=n=${scenePaths.length}:v=1:a=0,` +
    `fade=t=in:st=0:d=0.12,fade=t=out:st=${(totalDuration - 0.32).toFixed(3)}:d=0.32[vout]`
  );

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[vout]',
    '-map', `${scenePaths.length}:a`,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-r', '30',
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
    '-c:a', 'aac',
    '-ar', '44100',
    '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    outputPath
  );

  const result = spawnSync('ffmpeg', args, {
    cwd: outputDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    throw new Error(`FFmpeg failed:\n${result.stderr}`);
  }
  return outputPath;
}

async function main() {
  if (!fs.existsSync(narrationPath)) throw new Error('Narration MP3 is missing.');
  if (!fs.existsSync(logoPath)) throw new Error('Generated LootRadar emblem is missing.');

  const artwork = await Promise.all(snapshot.deals.map(downloadArtwork));
  const scenes = [
    await buildHook(),
    await buildMethod()
  ];
  for (let index = 0; index < snapshot.deals.length; index += 1) {
    scenes.push(await buildDealScene(snapshot.deals[index], index + 1, artwork[index]));
  }
  scenes.push(await buildCta());

  const video = renderVideo(scenes);
  console.log(`Rendered ${video}`);
  for (const scene of scenes) console.log(`Scene ${scene}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
