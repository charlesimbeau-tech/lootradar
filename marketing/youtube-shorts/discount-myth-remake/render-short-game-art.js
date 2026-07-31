'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');

const WIDTH = 1080;
const HEIGHT = 1920;
const BG = '#070a08';
const PANEL = '#0b120e';
const LINE = '#354238';
const LIME = '#b9f55d';
const WHITE = '#f7f8f6';
const MUTED = '#b8c1ba';
const GOLD = '#f3b85a';
const RED = '#ff7974';
const FONT = 'Segoe UI, Arial, sans-serif';

const root = __dirname;
const artDir = path.join(root, 'game-art');
const generatedDir = path.join(root, 'generated-game-art');
const sceneDir = path.join(generatedDir, 'scenes');
const previewDir = path.join(generatedDir, 'previews');
const narrationPath = path.join(root, 'lootradar-discount-myth-remake-narration.mp3');
const outputPath = path.join(root, 'lootradar-discount-myth-real-deals.mp4');
const contactSheetPath = path.join(generatedDir, 'contact-sheet.png');
const thumbnailLandscapePath = path.join(root, 'lootradar-discount-myth-thumbnail-1280x720.jpg');
const thumbnailVerticalPath = path.join(root, 'lootradar-discount-myth-thumbnail-vertical.jpg');

const SNAPSHOT = 'PRICES CHECKED JULY 30, 2026';
const DEALS = Object.freeze({
  re4: {
    title: 'RESIDENT EVIL 4',
    art: path.join(artDir, 'resident-evil-4.jpg'),
    price: '$8.79',
    regular: '$39.99',
    discount: '78%',
    rating: '96%',
    reviews: '69.7K',
    score: '91',
    store: 'FANATICAL'
  },
  injustice: {
    title: 'INJUSTICE 2',
    art: path.join(artDir, 'injustice-2.jpg'),
    price: '$4.99',
    regular: '$49.99',
    discount: '90%',
    rating: '85%',
    reviews: '6.9K',
    score: '88',
    store: 'STEAM'
  },
  psychonauts: {
    title: 'PSYCHONAUTS',
    art: path.join(artDir, 'psychonauts.jpg'),
    price: '$0.99',
    regular: '$9.99',
    discount: '90%',
    rating: '95%',
    reviews: '8.9K',
    score: '91',
    store: 'STEAM'
  }
});

const BOUNDARIES = Object.freeze([
  0,
  1.95,
  4.814478,
  8.385805,
  10.613107,
  11.484241,
  12.839207,
  16.353549,
  22.918844,
  26.458594,
  31.174626,
  33.959125
]);

const SCENES = Object.freeze([
  { id: 'hook', art: 'psychonauts', caption: ['A NINETY PERCENT', 'DISCOUNT...'] },
  { id: 'verdict', art: 're4', caption: ["...ISN'T ALWAYS THE MOST", 'IMPORTANT FACTOR WHEN SHOPPING.'] },
  { id: 'questions', art: 'injustice', caption: ['THAT NUMBER DOES NOT TELL YOU', 'IF THE GAME IS ACTUALLY GOOD.'] },
  { id: 'reviews', art: 're4', caption: ['LOOTRADAR CHECKS', 'PLAYER REVIEWS,'] },
  { id: 'value', art: 'psychonauts', caption: ['PRICE VALUE,'] },
  { id: 'confidence', art: 'injustice', caption: ['AND REVIEW CONFIDENCE,'] },
  { id: 'score', art: 're4', caption: ['THEN GENERATES A SCORE', 'SHOWING THE REAL IMPACT', 'OF YOUR DISCOUNT.'] },
  { id: 'comparison', art: 're4', caption: ['A GREAT GAME WITH A SMALLER CUT', 'CAN OUTRANK A WEAKER-REVIEWED', 'GAME AT 90% OFF.'] },
  { id: 'rule', art: 'psychonauts', caption: ['BUY THE BETTER GAME,', 'NOT JUST THE BIGGER PERCENTAGE.'] },
  { id: 'deals', art: 're4', caption: ["FIND TODAY'S QUALITY-FIRST", 'PC GAME DEALS AT', 'THELOOTRADAR.COM,'] },
  { id: 'final', art: 're4', caption: ['AND START BEING A MORE', 'CONFIDENT SHOPPER TODAY.'] }
].map((scene, index) => ({
  ...scene,
  start: BOUNDARIES[index],
  end: BOUNDARIES[index + 1],
  duration: BOUNDARIES[index + 1] - BOUNDARIES[index]
})));

fs.mkdirSync(sceneDir, { recursive: true });
fs.mkdirSync(previewDir, { recursive: true });

for (const deal of Object.values(DEALS)) {
  if (!fs.existsSync(deal.art)) throw new Error(`Missing game art: ${deal.art}`);
}
if (!fs.existsSync(narrationPath)) throw new Error('The narration MP3 is missing.');

const ART = Object.fromEntries(Object.entries(DEALS).map(([key, deal]) => [
  key,
  `data:image/jpeg;base64,${fs.readFileSync(deal.art).toString('base64')}`
]));

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function poster(id, key, x, y, width, height, options = {}) {
  const deal = DEALS[key];
  const rotate = options.rotate || 0;
  const border = options.border || LINE;
  const badge = options.badge === false ? '' : `
    <g transform="translate(${width - 158} 28)">
      <rect width="130" height="68" rx="34" fill="${options.badgeColor || LIME}"/>
      <text x="65" y="46" fill="${BG}" text-anchor="middle" font-family="${FONT}" font-size="31" font-weight="900">${deal.discount} OFF</text>
    </g>`;
  return `
    <g transform="translate(${x} ${y}) rotate(${rotate} ${width / 2} ${height / 2})" filter="url(#shadow)">
      <defs><clipPath id="${id}"><rect width="${width}" height="${height}" rx="34"/></clipPath></defs>
      <rect width="${width}" height="${height}" rx="34" fill="${PANEL}" stroke="${border}" stroke-width="5"/>
      <image href="${ART[key]}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>
      <rect width="${width}" height="${height}" rx="34" fill="url(#posterShade)"/>
      ${badge}
      ${options.footer === false ? '' : `
        <rect x="0" y="${height - 138}" width="${width}" height="138" rx="0" fill="#07100ce8" clip-path="url(#${id})"/>
        <text x="28" y="${height - 82}" fill="${WHITE}" font-family="${FONT}" font-size="${Math.min(31, width / 10.5)}" font-weight="900">${escapeXml(deal.title)}</text>
        <text x="28" y="${height - 36}" fill="${LIME}" font-family="${FONT}" font-size="29" font-weight="900">${deal.price} <tspan fill="${MUTED}" font-size="21">${deal.store}</tspan></text>
      `}
    </g>`;
}

function brandHeader(index) {
  const progress = SCENES.map((_, barIndex) => (
    `<rect x="${62 + barIndex * 88}" y="154" width="68" height="7" rx="4" fill="${barIndex <= index ? LIME : '#314039'}"/>`
  )).join('');
  return `
    <rect width="${WIDTH}" height="196" fill="#050806e8"/>
    <circle cx="92" cy="78" r="31" fill="none" stroke="${LIME}" stroke-width="5"/>
    <circle cx="92" cy="78" r="14" fill="none" stroke="${LIME}" stroke-width="4"/>
    <path d="M92 78 L117 53" stroke="${LIME}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="117" cy="53" r="5" fill="${WHITE}"/>
    <text x="142" y="85" fill="${WHITE}" font-family="${FONT}" font-size="39" font-weight="900">Loot<tspan fill="${LIME}">Radar</tspan></text>
    <text x="1008" y="78" fill="${MUTED}" text-anchor="end" font-family="${FONT}" font-size="18" font-weight="800" letter-spacing="2">${SNAPSHOT}</text>
    ${progress}`;
}

function captionBand(lines) {
  const firstY = lines.length === 3 ? 1658 : lines.length === 2 ? 1687 : 1715;
  const tspans = lines.map((line, index) => (
    `<tspan x="102" dy="${index ? 55 : 0}" fill="${index === lines.length - 1 ? LIME : WHITE}">${escapeXml(line)}</tspan>`
  )).join('');
  return `
    <g filter="url(#shadow)">
      <rect x="54" y="1570" width="972" height="252" rx="38" fill="#07100cf2" stroke="${LINE}" stroke-width="3"/>
      <rect x="54" y="1570" width="11" height="252" rx="6" fill="${LIME}"/>
      <text x="102" y="${firstY}" fill="${WHITE}" font-family="${FONT}" font-size="43" font-weight="900">${tspans}</text>
    </g>
    <text x="54" y="1882" fill="${MUTED}" font-family="${FONT}" font-size="18" font-weight="800" letter-spacing="2">REAL DEALS FROM THE LOOTRADAR SNAPSHOT</text>`;
}

function baseSvg(scene, index, body) {
  return Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="bgBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="34"/></filter>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#000" flood-opacity=".68"/></filter>
        <linearGradient id="screenShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#07100c" stop-opacity=".4"/>
          <stop offset=".62" stop-color="#07100c" stop-opacity=".72"/>
          <stop offset="1" stop-color="#050806" stop-opacity=".96"/>
        </linearGradient>
        <linearGradient id="posterShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset=".48" stop-color="#000" stop-opacity="0"/>
          <stop offset="1" stop-color="#000" stop-opacity=".8"/>
        </linearGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="${BG}"/>
      <image href="${ART[scene.art]}" x="-80" y="120" width="1240" height="1580" preserveAspectRatio="xMidYMid slice" filter="url(#bgBlur)" opacity=".74"/>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#screenShade)"/>
      ${brandHeader(index)}
      ${body}
      ${captionBand(scene.caption)}
      <text x="1022" y="1882" fill="${MUTED}" text-anchor="end" font-family="${FONT}" font-size="18" font-weight="800">${String(index + 1).padStart(2, '0')} / 11</text>
    </svg>`);
}

function hookScene() {
  return `
    <text x="540" y="288" fill="${WHITE}" text-anchor="middle" font-family="${FONT}" font-size="58" font-weight="900">REAL DEALS. REAL COVER ART.</text>
    ${poster('hook-left', 'injustice', 45, 400, 344, 860, { rotate: -6, badgeColor: GOLD })}
    ${poster('hook-right', 're4', 690, 400, 344, 860, { rotate: 6 })}
    ${poster('hook-center', 'psychonauts', 348, 338, 384, 960, { border: LIME })}
  `;
}

function verdictScene() {
  return `
    ${poster('verdict-re4', 're4', 68, 274, 578, 1040, { border: LIME })}
    <g transform="translate(600 410)" filter="url(#shadow)">
      <rect width="420" height="600" rx="40" fill="#08100ded" stroke="${LINE}" stroke-width="3"/>
      <text x="38" y="88" fill="${GOLD}" font-family="${FONT}" font-size="76" font-weight="900">90% OFF</text>
      <text x="38" y="150" fill="${MUTED}" font-family="${FONT}" font-size="26" font-weight="800">GRABS ATTENTION</text>
      <line x1="38" y1="196" x2="382" y2="196" stroke="${LINE}" stroke-width="3"/>
      <text x="38" y="294" fill="${WHITE}" font-family="${FONT}" font-size="55" font-weight="900">BUT THE</text>
      <text x="38" y="361" fill="${LIME}" font-family="${FONT}" font-size="55" font-weight="900">BETTER GAME</text>
      <text x="38" y="428" fill="${WHITE}" font-family="${FONT}" font-size="55" font-weight="900">CAN HAVE A</text>
      <text x="38" y="495" fill="${LIME}" font-family="${FONT}" font-size="55" font-weight="900">SMALLER CUT.</text>
    </g>`;
}

function questionsScene() {
  return `
    ${poster('questions-injustice', 'injustice', 98, 280, 530, 1050, { border: GOLD, badgeColor: GOLD })}
    <g transform="translate(596 346)" filter="url(#shadow)">
      <rect width="424" height="826" rx="42" fill="#08100df2" stroke="${LINE}" stroke-width="3"/>
      <text x="38" y="84" fill="${GOLD}" font-family="${FONT}" font-size="58" font-weight="900">90% OFF</text>
      ${[
        ['IS IT GOOD?', 'NOT ANSWERED'],
        ['ENOUGH REVIEWS?', 'NOT ANSWERED'],
        ['GOOD AT THIS PRICE?', 'NOT ANSWERED']
      ].map((row, i) => `
        <g transform="translate(30 ${150 + i * 190})">
          <rect width="364" height="158" rx="28" fill="#131d17" stroke="${LINE}" stroke-width="2"/>
          <text x="24" y="62" fill="${WHITE}" font-family="${FONT}" font-size="27" font-weight="900">${row[0]}</text>
          <text x="24" y="112" fill="${RED}" font-family="${FONT}" font-size="22" font-weight="900">${row[1]}</text>
        </g>`).join('')}
    </g>`;
}

function evidenceScene(key, heading, rows, accent = LIME) {
  return `
    ${poster(`evidence-${key}`, key, 62, 270, 540, 1050, { border: accent })}
    <g transform="translate(568 342)" filter="url(#shadow)">
      <rect width="460" height="838" rx="42" fill="#08100df2" stroke="${LINE}" stroke-width="3"/>
      <text x="36" y="72" fill="${MUTED}" font-family="${FONT}" font-size="23" font-weight="800" letter-spacing="2">${escapeXml(DEALS[key].title)}</text>
      <text x="36" y="146" fill="${accent}" font-family="${FONT}" font-size="49" font-weight="900">${escapeXml(heading)}</text>
      ${rows.map((row, i) => `
        <g transform="translate(32 ${210 + i * 174})">
          <rect width="396" height="142" rx="26" fill="#142019" stroke="${i === 0 ? accent : LINE}" stroke-width="${i === 0 ? 3 : 2}"/>
          <text x="25" y="50" fill="${MUTED}" font-family="${FONT}" font-size="21" font-weight="800">${escapeXml(row[0])}</text>
          <text x="25" y="105" fill="${WHITE}" font-family="${FONT}" font-size="40" font-weight="900">${escapeXml(row[1])}</text>
        </g>`).join('')}
    </g>`;
}

function comparisonScene() {
  return `
    <text x="540" y="285" fill="${WHITE}" text-anchor="middle" font-family="${FONT}" font-size="54" font-weight="900">CURRENT LOOTRADAR EXAMPLE</text>
    ${poster('compare-re4', 're4', 52, 340, 466, 760, { border: LIME, footer: false })}
    ${poster('compare-injustice', 'injustice', 562, 340, 466, 760, { border: GOLD, footer: false, badgeColor: GOLD })}
    <g transform="translate(52 1132)">
      <rect width="466" height="368" rx="34" fill="#08100df2" stroke="${LIME}" stroke-width="4"/>
      <text x="28" y="54" fill="${WHITE}" font-family="${FONT}" font-size="28" font-weight="900">RESIDENT EVIL 4</text>
      <text x="28" y="128" fill="${LIME}" font-family="${FONT}" font-size="64" font-weight="900">78% OFF</text>
      <text x="28" y="190" fill="${WHITE}" font-family="${FONT}" font-size="31" font-weight="800">96% POSITIVE · 69.7K</text>
      <text x="28" y="250" fill="${MUTED}" font-family="${FONT}" font-size="23" font-weight="800">DEAL SCORE</text>
      <text x="28" y="331" fill="${LIME}" font-family="${FONT}" font-size="86" font-weight="900">91</text>
    </g>
    <g transform="translate(562 1132)">
      <rect width="466" height="368" rx="34" fill="#08100df2" stroke="${GOLD}" stroke-width="4"/>
      <text x="28" y="54" fill="${WHITE}" font-family="${FONT}" font-size="28" font-weight="900">INJUSTICE 2</text>
      <text x="28" y="128" fill="${GOLD}" font-family="${FONT}" font-size="64" font-weight="900">90% OFF</text>
      <text x="28" y="190" fill="${WHITE}" font-family="${FONT}" font-size="31" font-weight="800">85% POSITIVE · 6.9K</text>
      <text x="28" y="250" fill="${MUTED}" font-family="${FONT}" font-size="23" font-weight="800">DEAL SCORE</text>
      <text x="28" y="331" fill="${GOLD}" font-family="${FONT}" font-size="86" font-weight="900">88</text>
    </g>`;
}

function ruleScene() {
  return `
    ${poster('rule-left', 'injustice', 58, 348, 330, 850, { rotate: -7, badgeColor: GOLD, footer: false })}
    ${poster('rule-right', 're4', 692, 348, 330, 850, { rotate: 7, footer: false })}
    ${poster('rule-center', 'psychonauts', 354, 288, 372, 970, { border: LIME, footer: false })}
    <g transform="translate(92 1254)" filter="url(#shadow)">
      <rect width="896" height="246" rx="40" fill="#08100df2" stroke="${LINE}" stroke-width="3"/>
      <text x="448" y="93" fill="${WHITE}" text-anchor="middle" font-family="${FONT}" font-size="72" font-weight="900">BUY THE GAME.</text>
      <text x="448" y="176" fill="${LIME}" text-anchor="middle" font-family="${FONT}" font-size="66" font-weight="900">CHECK THE EVIDENCE.</text>
    </g>`;
}

function dealCard(key, x) {
  const deal = DEALS[key];
  return `
    <g transform="translate(${x} 350)" filter="url(#shadow)">
      ${poster(`deal-${key}`, key, 0, 0, 310, 700, { footer: false, border: key === 're4' ? LIME : LINE })}
      <rect y="690" width="310" height="390" rx="34" fill="#08100df5" stroke="${key === 're4' ? LIME : LINE}" stroke-width="3"/>
      <text x="24" y="758" fill="${WHITE}" font-family="${FONT}" font-size="27" font-weight="900">${escapeXml(deal.title)}</text>
      <text x="24" y="838" fill="${LIME}" font-family="${FONT}" font-size="49" font-weight="900">${deal.price}</text>
      <text x="24" y="885" fill="${MUTED}" font-family="${FONT}" font-size="21" font-weight="800">${deal.discount} OFF · ${deal.rating} POSITIVE</text>
      <text x="24" y="948" fill="${MUTED}" font-family="${FONT}" font-size="21" font-weight="800">DEAL SCORE</text>
      <text x="24" y="1034" fill="${WHITE}" font-family="${FONT}" font-size="78" font-weight="900">${deal.score}</text>
    </g>`;
}

function finalScene() {
  return `
    ${poster('final-re4', 're4', 222, 250, 636, 1080, { border: LIME, footer: false })}
    <g transform="translate(112 1260)" filter="url(#shadow)">
      <rect width="856" height="240" rx="48" fill="#08100df2" stroke="${LINE}" stroke-width="3"/>
      <text x="428" y="82" fill="${WHITE}" text-anchor="middle" font-family="${FONT}" font-size="56" font-weight="900">REAL GAMES. BETTER SIGNALS.</text>
      <rect x="70" y="120" width="716" height="92" rx="46" fill="${LIME}"/>
      <text x="428" y="181" fill="${BG}" text-anchor="middle" font-family="${FONT}" font-size="41" font-weight="900">THELOOTRADAR.COM</text>
    </g>`;
}

function sceneBody(scene) {
  switch (scene.id) {
    case 'hook': return hookScene();
    case 'verdict': return verdictScene();
    case 'questions': return questionsScene();
    case 'reviews':
      return evidenceScene('re4', 'PLAYER REVIEWS', [
        ['POSITIVE RATING', '96%'],
        ['PLAYER REVIEWS', '69.7K'],
        ['DEAL SCORE', '91']
      ]);
    case 'value':
      return evidenceScene('psychonauts', 'PRICE VALUE', [
        ['CURRENT PRICE', '$0.99'],
        ['LIST PRICE', '$9.99'],
        ['CURRENT CUT', '90% OFF']
      ]);
    case 'confidence':
      return evidenceScene('injustice', 'CONFIDENCE', [
        ['POSITIVE RATING', '85%'],
        ['PLAYER REVIEWS', '6.9K'],
        ['EVIDENCE', 'SOLID']
      ], GOLD);
    case 'score':
      return evidenceScene('re4', 'DEAL SCORE 91', [
        ['GAME QUALITY', '96% POSITIVE'],
        ['PRICE VALUE', '$8.79'],
        ['DISCOUNT', '78% OFF']
      ]);
    case 'comparison': return comparisonScene();
    case 'rule': return ruleScene();
    case 'deals':
      return `
        <text x="540" y="280" fill="${WHITE}" text-anchor="middle" font-family="${FONT}" font-size="58" font-weight="900">TODAY'S QUALITY-FIRST PICKS</text>
        ${dealCard('re4', 48)}
        ${dealCard('psychonauts', 385)}
        ${dealCard('injustice', 722)}`;
    case 'final': return finalScene();
    default: throw new Error(`Unknown scene: ${scene.id}`);
  }
}

async function buildScenes() {
  const paths = [];
  for (const [index, scene] of SCENES.entries()) {
    const target = path.join(sceneDir, `${String(index + 1).padStart(2, '0')}-${scene.id}.png`);
    await sharp(baseSvg(scene, index, sceneBody(scene))).png({ compressionLevel: 9 }).toFile(target);
    paths.push(target);
  }
  return paths;
}

async function createContactSheet(scenePaths) {
  const tileWidth = 270;
  const tileHeight = 480;
  const columns = 4;
  const rows = Math.ceil(scenePaths.length / columns);
  const tiles = await Promise.all(scenePaths.map(file => sharp(file).resize(tileWidth, tileHeight).png().toBuffer()));
  await sharp({
    create: { width: tileWidth * columns, height: tileHeight * rows, channels: 4, background: BG }
  }).composite(tiles.map((input, index) => ({
    input,
    left: (index % columns) * tileWidth,
    top: Math.floor(index / columns) * tileHeight
  }))).png().toFile(contactSheetPath);
}

function renderVideo(scenePaths) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  scenePaths.forEach((file, index) => {
    args.push('-loop', '1', '-framerate', '30', '-t', SCENES[index].duration.toFixed(6), '-i', file);
  });
  args.push('-i', narrationPath);
  const filters = scenePaths.map((_, index) => {
    const duration = SCENES[index].duration;
    const fadeOutStart = Math.max(0, duration - 0.12);
    const direction = index % 2 ? -1 : 1;
    return `[${index}:v]scale=1120:1992,crop=1080:1920:x='20+${direction}*7*sin(t*0.72+${index})':y='36+6*cos(t*0.61+${index})',setsar=1,fps=30,trim=duration=${duration.toFixed(6)},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.07,fade=t=out:st=${fadeOutStart.toFixed(6)}:d=0.12[v${index}]`;
  });
  filters.push(`${scenePaths.map((_, index) => `[v${index}]`).join('')}concat=n=${scenePaths.length}:v=1:a=0[vout]`);
  filters.push(`[${scenePaths.length}:a]loudnorm=I=-16:TP=-1.5:LRA=9[aout]`);
  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[vout]',
    '-map', '[aout]',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-r', '30',
    '-c:a', 'aac',
    '-ar', '44100',
    '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    outputPath
  );
  const result = spawnSync('ffmpeg', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`FFmpeg failed: ${result.error?.message || result.stderr || `exit ${result.status}`}`);
  }
}

function extractPreview(time, name) {
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', String(time),
    '-i', outputPath,
    '-frames:v', '1',
    '-q:v', '2',
    path.join(previewDir, name)
  ], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`Preview extraction failed: ${result.error?.message || result.stderr}`);
}

function thumbnailSvg(width, height, vertical = false) {
  const coverX = vertical ? 155 : 735;
  const coverY = vertical ? 255 : -30;
  const coverW = vertical ? 770 : 545;
  const coverH = vertical ? 1160 : 818;
  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="blur"><feGaussianBlur stdDeviation="24"/></filter>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="16" stdDeviation="24" flood-opacity=".75"/></filter>
        <linearGradient id="fade" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">
          <stop offset="0" stop-color="#050806" stop-opacity="${vertical ? '.35' : '.98'}"/>
          <stop offset=".66" stop-color="#050806" stop-opacity="${vertical ? '.72' : '.5'}"/>
          <stop offset="1" stop-color="#050806" stop-opacity=".15"/>
        </linearGradient>
        <clipPath id="thumbCover"><rect x="${coverX}" y="${coverY}" width="${coverW}" height="${coverH}" rx="38"/></clipPath>
      </defs>
      <rect width="${width}" height="${height}" fill="${BG}"/>
      <image href="${ART.re4}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" filter="url(#blur)" opacity=".72"/>
      <rect width="${width}" height="${height}" fill="url(#fade)"/>
      <image href="${ART.re4}" x="${coverX}" y="${coverY}" width="${coverW}" height="${coverH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#thumbCover)" filter="url(#shadow)"/>
      <rect x="${coverX}" y="${coverY}" width="${coverW}" height="${coverH}" rx="38" fill="none" stroke="${LIME}" stroke-width="7"/>
      <text x="${vertical ? 72 : 68}" y="${vertical ? 110 : 82}" fill="${WHITE}" font-family="${FONT}" font-size="${vertical ? 43 : 34}" font-weight="900">Loot<tspan fill="${LIME}">Radar</tspan></text>
      <text x="${vertical ? 540 : 68}" y="${vertical ? 1500 : 244}" text-anchor="${vertical ? 'middle' : 'start'}" fill="${WHITE}" font-family="${FONT}" font-size="${vertical ? 92 : 75}" font-weight="900">
        <tspan x="${vertical ? 540 : 68}">THE DISCOUNT</tspan>
        <tspan x="${vertical ? 540 : 68}" dy="${vertical ? 104 : 86}" fill="${LIME}">ISN'T THE VERDICT.</tspan>
      </text>
      <text x="${vertical ? 540 : 68}" y="${vertical ? 1740 : 458}" text-anchor="${vertical ? 'middle' : 'start'}" fill="${MUTED}" font-family="${FONT}" font-size="${vertical ? 38 : 29}" font-weight="800">CHECK THE GAME. CHECK THE EVIDENCE.</text>
      ${vertical ? '' : `<rect x="68" y="530" width="520" height="104" rx="52" fill="${LIME}"/><text x="328" y="599" fill="${BG}" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="900">THELOOTRADAR.COM</text>`}
    </svg>`);
}

async function createThumbnails() {
  await sharp(thumbnailSvg(1280, 720, false)).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(thumbnailLandscapePath);
  await sharp(thumbnailSvg(1080, 1920, true)).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(thumbnailVerticalPath);
}

async function main() {
  const scenePaths = await buildScenes();
  await createContactSheet(scenePaths);
  await createThumbnails();
  renderVideo(scenePaths);
  extractPreview(1.1, 'verify-hook.png');
  extractPreview(9.5, 'verify-reviews.png');
  extractPreview(19.3, 'verify-comparison.png');
  extractPreview(28.5, 'verify-deals.png');
  extractPreview(32.1, 'verify-final.png');
  console.log(`Rendered ${outputPath}`);
  console.log(`Created ${thumbnailLandscapePath}`);
  console.log(`Created ${thumbnailVerticalPath}`);
  console.log(`Contact sheet ${contactSheetPath}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
