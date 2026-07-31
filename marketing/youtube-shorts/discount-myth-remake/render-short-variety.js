'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');

const W = 1080;
const H = 1920;
const BG = '#050806';
const LIME = '#b9f55d';
const WHITE = '#f7f8f6';
const MUTED = '#bdc5bf';
const GOLD = '#f4b65a';
const RED = '#ff7770';
const LINE = '#354138';
const FONT = 'Segoe UI, Arial, sans-serif';

const root = __dirname;
const artDir = path.join(root, 'game-art-cinematic');
const generatedDir = path.join(root, 'generated-variety');
const sceneDir = path.join(generatedDir, 'scenes');
const previewDir = path.join(generatedDir, 'previews');
const narrationPath = path.join(root, 'lootradar-discount-myth-remake-narration.mp3');
const outputPath = path.join(root, 'lootradar-discount-myth-variety-cut.mp4');
const contactSheetPath = path.join(generatedDir, 'contact-sheet.png');
const thumbnailPath = path.join(root, 'lootradar-60-vs-90-thumbnail-1280x720.jpg');
const verticalThumbnailPath = path.join(root, 'lootradar-60-vs-90-thumbnail-vertical.jpg');

const GAMES = Object.freeze({
  massEffect: { key: 'mass-effect', title: 'MASS EFFECT LEGENDARY EDITION', price: '$5.99', discount: '90%', rating: '91%', reviews: '41K', score: '89' },
  monsterHunter: { key: 'monster-hunter', title: 'MONSTER HUNTER: WORLD', price: '$6.89', discount: '77%', rating: '92%', reviews: '115.3K', score: '88' },
  lego: { key: 'lego-star-wars', title: 'LEGO STAR WARS', price: '$8.80', discount: '82%', rating: '89%', reviews: '26.6K', score: '88' },
  injustice: { key: 'injustice-2', title: 'INJUSTICE 2', price: '$4.99', discount: '90%', rating: '85%', reviews: '6.9K', score: '88' },
  borderlands: { key: 'borderlands-3', title: 'BORDERLANDS 3', price: '$5.35', discount: '91%', rating: '81%', reviews: '60K', score: '88' },
  detroit: { key: 'detroit', title: 'DETROIT: BECOME HUMAN', price: '$7.99', discount: '80%', rating: '95%', reviews: '56.6K', score: '89' },
  psychonauts: { key: 'psychonauts', title: 'PSYCHONAUTS', price: '$0.99', discount: '90%', rating: '95%', reviews: '8.9K', score: '91' },
  darkestDungeon: { key: 'darkest-dungeon', title: 'DARKEST DUNGEON', price: '$2.88', discount: '88%', rating: '90%', reviews: '56.4K', score: '90' },
  neonWhite: { key: 'neon-white', title: 'NEON WHITE', price: '$7.88', discount: '68%', rating: '98%', reviews: '12.5K', score: '88' },
  quake: { key: 'quake', title: 'QUAKE', price: '$3.99', discount: '60%', rating: '96%', reviews: '9.9K', score: '86' },
  deadIsland: { key: 'dead-island-riptide', title: 'DEAD ISLAND RIPTIDE', price: '$2.29', discount: '90%', rating: '73%', reviews: '2.5K', score: '59' },
  dyingLight: { key: 'dying-light', title: 'DYING LIGHT', price: '$4.99', discount: '80%', rating: '94%', reviews: '98.3K', score: '89' },
  control: { key: 'control', title: 'CONTROL ULTIMATE EDITION', price: '$5.99', discount: '85%', rating: '88%', reviews: '25.2K', score: '89' },
  frostpunk: { key: 'frostpunk', title: 'FROSTPUNK', price: '$4.49', discount: '85%', rating: '92%', reviews: '38.8K', score: '89' },
  beforeEyes: { key: 'before-your-eyes', title: 'BEFORE YOUR EYES', price: '$1.99', discount: '80%', rating: '98%', reviews: '15.4K', score: '88' }
});

const BOUNDARIES = Object.freeze([
  0, 1.95, 4.814478, 8.385805, 10.613107, 11.484241,
  12.839207, 16.353549, 22.918844, 26.458594, 31.174626, 33.959125
]);

const SCENES = Object.freeze([
  { id: 'hook', bg: GAMES.massEffect, caption: ['A NINETY PERCENT', 'DISCOUNT...'] },
  { id: 'badge', bg: GAMES.injustice, caption: ["...ISN'T ALWAYS THE MOST", 'IMPORTANT FACTOR WHEN SHOPPING.'] },
  { id: 'questions', bg: GAMES.borderlands, caption: ['THAT NUMBER DOES NOT TELL YOU', 'IF THE GAME IS ACTUALLY GOOD.'] },
  { id: 'reviews', bg: GAMES.detroit, caption: ['LOOTRADAR CHECKS', 'PLAYER REVIEWS,'] },
  { id: 'value', bg: GAMES.psychonauts, caption: ['PRICE VALUE,'] },
  { id: 'confidence', bg: GAMES.darkestDungeon, caption: ['AND REVIEW CONFIDENCE,'] },
  { id: 'score', bg: GAMES.neonWhite, caption: ['THEN GENERATES A SCORE', 'SHOWING THE REAL IMPACT', 'OF YOUR DISCOUNT.'] },
  { id: 'comparison', bg: GAMES.quake, caption: ['A GREAT GAME AT 60% OFF', 'CAN OUTRANK A WEAKLY REVIEWED', 'GAME AT 90% OFF.'] },
  { id: 'rule', bg: GAMES.dyingLight, caption: ['BUY THE BETTER GAME,', 'NOT JUST THE BIGGER PERCENTAGE.'] },
  { id: 'picks', bg: GAMES.control, caption: ["FIND TODAY'S QUALITY-FIRST", 'PC GAME DEALS AT', 'THELOOTRADAR.COM,'] },
  { id: 'final', bg: GAMES.quake, caption: ['AND START BEING A MORE', 'CONFIDENT SHOPPER TODAY.'] }
].map((scene, index) => ({
  ...scene,
  start: BOUNDARIES[index],
  end: BOUNDARIES[index + 1],
  duration: BOUNDARIES[index + 1] - BOUNDARIES[index]
})));

fs.mkdirSync(sceneDir, { recursive: true });
fs.mkdirSync(previewDir, { recursive: true });

function loadAsset(game, type) {
  const file = path.join(artDir, `${game.key}-${type}.jpg`);
  if (!fs.existsSync(file)) throw new Error(`Missing asset: ${file}`);
  return `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}`;
}

const MEDIA = Object.fromEntries(Object.entries(GAMES).map(([name, game]) => [
  name,
  { shot: loadAsset(game, 'shot'), cover: loadAsset(game, 'cover') }
]));

function media(game) {
  const entry = Object.entries(GAMES).find(([, candidate]) => candidate.key === game.key);
  if (!entry) throw new Error(`Unknown game: ${game.key}`);
  return MEDIA[entry[0]];
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function image(id, game, type, x, y, width, height, options = {}) {
  const radius = options.radius ?? 30;
  const rotate = options.rotate ?? 0;
  const opacity = options.opacity ?? 1;
  const border = options.border || 'none';
  return `
    <g transform="translate(${x} ${y}) rotate(${rotate} ${width / 2} ${height / 2})" opacity="${opacity}" ${options.shadow === false ? '' : 'filter="url(#shadow)"'}>
      <defs><clipPath id="${id}"><rect width="${width}" height="${height}" rx="${radius}"/></clipPath></defs>
      <image href="${media(game)[type]}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>
      ${border === 'none' ? '' : `<rect width="${width}" height="${height}" rx="${radius}" fill="none" stroke="${border}" stroke-width="5"/>`}
    </g>`;
}

function defs() {
  return `
    <defs>
      <filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="30"/></filter>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity=".75"/></filter>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#050806" stop-opacity=".34"/>
        <stop offset=".55" stop-color="#050806" stop-opacity=".14"/>
        <stop offset="1" stop-color="#050806" stop-opacity=".96"/>
      </linearGradient>
      <linearGradient id="sideFade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#050806" stop-opacity=".97"/>
        <stop offset=".6" stop-color="#050806" stop-opacity=".4"/>
        <stop offset="1" stop-color="#050806" stop-opacity=".08"/>
      </linearGradient>
    </defs>`;
}

function baseBackground(game) {
  return `
    <rect width="${W}" height="${H}" fill="${BG}"/>
    <image href="${media(game).shot}" x="-330" y="0" width="1740" height="${H}" preserveAspectRatio="xMidYMid slice" filter="url(#blur)" opacity=".6"/>
    <rect width="${W}" height="${H}" fill="url(#fade)"/>`;
}

function brand(index) {
  return `
    <g filter="url(#shadow)">
      <rect x="28" y="28" width="316" height="82" rx="41" fill="#050806d9" stroke="${LINE}" stroke-width="2"/>
      <circle cx="78" cy="69" r="25" fill="none" stroke="${LIME}" stroke-width="4"/>
      <circle cx="78" cy="69" r="10" fill="none" stroke="${LIME}" stroke-width="3"/>
      <path d="M78 69 L97 50" stroke="${LIME}" stroke-width="4" stroke-linecap="round"/>
      <circle cx="97" cy="50" r="4" fill="${WHITE}"/>
      <text x="120" y="79" fill="${WHITE}" font-family="${FONT}" font-size="31" font-weight="900">Loot<tspan fill="${LIME}">Radar</tspan></text>
    </g>
    <text x="1030" y="75" fill="${WHITE}" text-anchor="end" font-family="${FONT}" font-size="20" font-weight="900">${String(index + 1).padStart(2, '0')} / 11</text>`;
}

function captions(lines) {
  const y = lines.length === 3 ? 1655 : lines.length === 2 ? 1692 : 1720;
  return `
    <rect x="0" y="1510" width="${W}" height="410" fill="url(#fade)"/>
    <text x="68" y="${y}" fill="${WHITE}" font-family="${FONT}" font-size="46" font-weight="900">
      ${lines.map((line, index) => `<tspan x="68" dy="${index ? 58 : 0}" fill="${index === lines.length - 1 ? LIME : WHITE}">${escapeXml(line)}</tspan>`).join('')}
    </text>
    <rect x="68" y="1834" width="460" height="5" rx="3" fill="${LIME}"/>
    <text x="68" y="1878" fill="${MUTED}" font-family="${FONT}" font-size="18" font-weight="800" letter-spacing="2">PRICES CHECKED JULY 30, 2026</text>`;
}

function pill(x, y, text, color = LIME, textColor = BG, width = 250) {
  return `<g transform="translate(${x} ${y})" filter="url(#shadow)"><rect width="${width}" height="78" rx="39" fill="${color}"/><text x="${width / 2}" y="52" fill="${textColor}" text-anchor="middle" font-family="${FONT}" font-size="33" font-weight="900">${escapeXml(text)}</text></g>`;
}

function hookScene() {
  return `
    ${image('hook-mass', GAMES.massEffect, 'cover', 54, 250, 330, 840, { rotate: -6, border: '#7f9dff' })}
    ${image('hook-monster', GAMES.monsterHunter, 'cover', 374, 200, 334, 910, { border: LIME })}
    ${image('hook-lego', GAMES.lego, 'cover', 694, 250, 330, 840, { rotate: 6, border: GOLD })}
    <text x="540" y="1220" fill="${WHITE}" text-anchor="middle" font-family="${FONT}" font-size="65" font-weight="900">THREE DEALS.</text>
    <text x="540" y="1294" fill="${LIME}" text-anchor="middle" font-family="${FONT}" font-size="65" font-weight="900">THREE DIFFERENT CASES.</text>
    ${pill(370, 1350, 'DISCOUNT ALONE?', GOLD, BG, 340)}`;
}

function badgeScene() {
  return `
    ${image('badge-shot', GAMES.injustice, 'shot', 0, 130, 1080, 1040, { radius: 0, shadow: false })}
    <rect x="0" y="130" width="1080" height="1040" fill="url(#sideFade)"/>
    ${image('badge-cover', GAMES.injustice, 'cover', 730, 250, 290, 730, { rotate: 4, border: GOLD })}
    <text x="62" y="380" fill="${GOLD}" font-family="${FONT}" font-size="158" font-weight="900">90%</text>
    <text x="68" y="492" fill="${GOLD}" font-family="${FONT}" font-size="92" font-weight="900">OFF</text>
    <text x="68" y="620" fill="${WHITE}" font-family="${FONT}" font-size="50" font-weight="900">A BIG NUMBER</text>
    <text x="68" y="682" fill="${WHITE}" font-family="${FONT}" font-size="50" font-weight="900">IS A START.</text>
    <text x="68" y="762" fill="${LIME}" font-family="${FONT}" font-size="50" font-weight="900">NOT A VERDICT.</text>`;
}

function questionsScene() {
  return `
    ${image('questions-shot', GAMES.borderlands, 'shot', 0, 130, 1080, 1030, { radius: 0, shadow: false })}
    <rect x="0" y="130" width="1080" height="1030" fill="#05080655"/>
    ${image('questions-cover', GAMES.borderlands, 'cover', 64, 300, 350, 830, { rotate: -3, border: GOLD })}
    <g transform="translate(440 300)" filter="url(#shadow)">
      <rect width="572" height="790" rx="42" fill="#050806e8" stroke="${LINE}" stroke-width="3"/>
      <text x="42" y="82" fill="${GOLD}" font-family="${FONT}" font-size="58" font-weight="900">91% OFF</text>
      ${[
        ['IS THE GAME GOOD?', 'THE BADGE CANNOT TELL YOU'],
        ['DO REVIEWS HOLD UP?', 'THE BADGE CANNOT TELL YOU'],
        ['IS THE PRICE WORTH IT?', 'THE BADGE CANNOT TELL YOU']
      ].map((row, i) => `
        <g transform="translate(34 ${150 + i * 188})">
          <rect width="504" height="150" rx="28" fill="#111a15" stroke="${i === 0 ? LIME : LINE}" stroke-width="2"/>
          <text x="24" y="58" fill="${WHITE}" font-family="${FONT}" font-size="28" font-weight="900">${row[0]}</text>
          <text x="24" y="106" fill="${RED}" font-family="${FONT}" font-size="20" font-weight="900">${row[1]}</text>
        </g>`).join('')}
    </g>`;
}

function reviewsScene() {
  return `
    ${image('reviews-shot', GAMES.detroit, 'shot', 0, 110, 1080, 1120, { radius: 0, shadow: false })}
    <rect x="0" y="110" width="1080" height="1120" fill="url(#sideFade)"/>
    <text x="62" y="350" fill="${WHITE}" font-family="${FONT}" font-size="62" font-weight="900">DETROIT:</text>
    <text x="62" y="417" fill="${WHITE}" font-family="${FONT}" font-size="62" font-weight="900">BECOME HUMAN</text>
    <text x="62" y="565" fill="${LIME}" font-family="${FONT}" font-size="132" font-weight="900">95%</text>
    <text x="68" y="635" fill="${WHITE}" font-family="${FONT}" font-size="44" font-weight="900">POSITIVE</text>
    <text x="68" y="735" fill="${MUTED}" font-family="${FONT}" font-size="33" font-weight="800">56.6K PLAYER REVIEWS</text>
    ${pill(62, 810, 'SIGNAL 01', LIME, BG, 230)}`;
}

function valueScene() {
  return `
    ${image('value-shot', GAMES.psychonauts, 'shot', 0, 130, 1080, 1040, { radius: 0, shadow: false })}
    <rect x="0" y="130" width="1080" height="1040" fill="#05080666"/>
    ${image('value-cover', GAMES.psychonauts, 'cover', 68, 250, 370, 870, { rotate: -4, border: LIME })}
    <g transform="translate(465 316)" filter="url(#shadow)">
      <text x="0" y="64" fill="${WHITE}" font-family="${FONT}" font-size="42" font-weight="900">PSYCHONAUTS</text>
      <text x="0" y="234" fill="${LIME}" font-family="${FONT}" font-size="146" font-weight="900">$0.99</text>
      <text x="8" y="306" fill="${MUTED}" font-family="${FONT}" font-size="32" font-weight="800">LIST PRICE $9.99</text>
      <line x1="8" y1="290" x2="278" y2="290" stroke="${RED}" stroke-width="5"/>
      ${pill(8, 362, '90% OFF', LIME, BG, 244)}
      <text x="8" y="536" fill="${WHITE}" font-family="${FONT}" font-size="48" font-weight="900">PRICE VALUE</text>
      <text x="8" y="598" fill="${MUTED}" font-family="${FONT}" font-size="28" font-weight="800">WHAT DOES A DOLLAR BUY?</text>
    </g>`;
}

function confidenceScene() {
  return `
    ${image('confidence-shot', GAMES.darkestDungeon, 'shot', 0, 120, 1080, 1030, { radius: 0, shadow: false })}
    <rect x="0" y="120" width="1080" height="1030" fill="#05080677"/>
    <text x="58" y="340" fill="${WHITE}" font-family="${FONT}" font-size="61" font-weight="900">DARKEST DUNGEON</text>
    <text x="58" y="472" fill="${LIME}" font-family="${FONT}" font-size="118" font-weight="900">56.4K</text>
    <text x="62" y="542" fill="${WHITE}" font-family="${FONT}" font-size="39" font-weight="900">PLAYER REVIEWS</text>
    <g transform="translate(58 660)" filter="url(#shadow)">
      <rect width="930" height="280" rx="38" fill="#050806dd" stroke="${LINE}" stroke-width="3"/>
      <text x="38" y="74" fill="${MUTED}" font-family="${FONT}" font-size="25" font-weight="800">REVIEW CONFIDENCE</text>
      <rect x="38" y="118" width="854" height="34" rx="17" fill="#2a352e"/>
      <rect x="38" y="118" width="772" height="34" rx="17" fill="${LIME}"/>
      <text x="38" y="220" fill="${WHITE}" font-family="${FONT}" font-size="42" font-weight="900">HIGH EVIDENCE DEPTH</text>
    </g>`;
}

function scoreScene() {
  return `
    ${image('score-shot', GAMES.neonWhite, 'shot', 0, 130, 1080, 1040, { radius: 0, shadow: false })}
    <rect x="0" y="130" width="1080" height="1040" fill="#05080666"/>
    ${image('score-cover', GAMES.neonWhite, 'cover', 60, 260, 350, 850, { rotate: -4, border: '#ff65cd' })}
    <g transform="translate(680 645)" filter="url(#shadow)">
      <circle r="244" fill="#07100dea" stroke="${LINE}" stroke-width="4"/>
      <circle r="200" fill="none" stroke="#29342d" stroke-width="24"/>
      <circle r="200" fill="none" stroke="${LIME}" stroke-width="24" stroke-dasharray="1104 153" stroke-linecap="round" transform="rotate(-90)"/>
      <text x="0" y="-35" fill="${MUTED}" text-anchor="middle" font-family="${FONT}" font-size="28" font-weight="900">DEAL SCORE</text>
      <text x="0" y="108" fill="${WHITE}" text-anchor="middle" font-family="${FONT}" font-size="170" font-weight="900">88</text>
    </g>
    <g transform="translate(460 278)">
      ${pill(0, 0, '98% POSITIVE', LIME, BG, 300)}
      ${pill(0, 102, '$7.88 TODAY', WHITE, BG, 300)}
      ${pill(0, 204, '68% OFF', GOLD, BG, 300)}
    </g>`;
}

function comparisonScene() {
  return `
    <text x="540" y="178" fill="${WHITE}" text-anchor="middle" font-family="${FONT}" font-size="52" font-weight="900">REAL CURRENT COMPARISON</text>
    ${image('compare-quake-shot', GAMES.quake, 'shot', 26, 240, 500, 570, { border: LIME })}
    ${image('compare-dead-shot', GAMES.deadIsland, 'shot', 554, 240, 500, 570, { border: GOLD })}
    <g transform="translate(26 834)" filter="url(#shadow)">
      <rect width="500" height="610" rx="38" fill="#050806ed" stroke="${LIME}" stroke-width="4"/>
      ${image('compare-quake-cover', GAMES.quake, 'cover', 24, 24, 160, 240, { radius: 20, shadow: false })}
      <text x="208" y="82" fill="${WHITE}" font-family="${FONT}" font-size="39" font-weight="900">QUAKE</text>
      <text x="208" y="146" fill="${LIME}" font-family="${FONT}" font-size="55" font-weight="900">60% OFF</text>
      <text x="208" y="201" fill="${WHITE}" font-family="${FONT}" font-size="25" font-weight="800">96% · 9.9K REVIEWS</text>
      <text x="34" y="340" fill="${MUTED}" font-family="${FONT}" font-size="25" font-weight="900">DEAL SCORE</text>
      <text x="34" y="480" fill="${LIME}" font-family="${FONT}" font-size="160" font-weight="900">86</text>
      <text x="34" y="552" fill="${WHITE}" font-family="${FONT}" font-size="28" font-weight="900">SMALLER CUT. STRONGER CASE.</text>
    </g>
    <g transform="translate(554 834)" filter="url(#shadow)">
      <rect width="500" height="610" rx="38" fill="#050806ed" stroke="${GOLD}" stroke-width="4"/>
      ${image('compare-dead-cover', GAMES.deadIsland, 'cover', 24, 24, 160, 240, { radius: 20, shadow: false })}
      <text x="208" y="82" fill="${WHITE}" font-family="${FONT}" font-size="22" font-weight="900">DEAD ISLAND RIPTIDE</text>
      <text x="208" y="146" fill="${GOLD}" font-family="${FONT}" font-size="55" font-weight="900">90% OFF</text>
      <text x="208" y="201" fill="${WHITE}" font-family="${FONT}" font-size="25" font-weight="800">73% · 2.5K REVIEWS</text>
      <text x="34" y="340" fill="${MUTED}" font-family="${FONT}" font-size="25" font-weight="900">DEAL SCORE</text>
      <text x="34" y="480" fill="${GOLD}" font-family="${FONT}" font-size="160" font-weight="900">59</text>
      <text x="34" y="552" fill="${WHITE}" font-family="${FONT}" font-size="28" font-weight="900">BIGGER CUT. WEAKER CASE.</text>
    </g>`;
}

function ruleScene() {
  return `
    ${image('rule-shot', GAMES.dyingLight, 'shot', 0, 0, 1080, 1360, { radius: 0, shadow: false })}
    <rect x="0" y="0" width="1080" height="1360" fill="url(#sideFade)"/>
    <g transform="translate(54 325) rotate(-3 480 300)" filter="url(#shadow)">
      <polygon points="0,0 910,70 840,590 36,530" fill="#050806e8" stroke="${LIME}" stroke-width="5"/>
      <text x="72" y="176" fill="${WHITE}" font-family="${FONT}" font-size="110" font-weight="900">BUY</text>
      <text x="72" y="292" fill="${LIME}" font-family="${FONT}" font-size="110" font-weight="900">BETTER.</text>
      <text x="72" y="422" fill="${WHITE}" font-family="${FONT}" font-size="72" font-weight="900">NOT BIGGER.</text>
    </g>
    ${pill(70, 1050, '94% POSITIVE · 98.3K REVIEWS', LIME, BG, 610)}`;
}

function pickBand(game, y, accent, id) {
  return `
    <g transform="translate(34 ${y})" filter="url(#shadow)">
      <defs><clipPath id="${id}"><rect width="1012" height="340" rx="36"/></clipPath></defs>
      <image href="${media(game).shot}" width="1012" height="340" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>
      <rect width="1012" height="340" rx="36" fill="url(#sideFade)" stroke="${accent}" stroke-width="4"/>
      ${image(`${id}-cover`, game, 'cover', 742, 24, 240, 292, { radius: 24, shadow: false })}
      <text x="42" y="82" fill="${WHITE}" font-family="${FONT}" font-size="38" font-weight="900">${escapeXml(game.title)}</text>
      <text x="42" y="162" fill="${LIME}" font-family="${FONT}" font-size="62" font-weight="900">${game.price}</text>
      <text x="42" y="222" fill="${WHITE}" font-family="${FONT}" font-size="29" font-weight="900">${game.discount} OFF · ${game.rating} POSITIVE</text>
      <text x="42" y="286" fill="${MUTED}" font-family="${FONT}" font-size="23" font-weight="900">DEAL SCORE ${game.score}</text>
    </g>`;
}

function picksScene() {
  return `
    <text x="54" y="176" fill="${WHITE}" font-family="${FONT}" font-size="55" font-weight="900">THREE MORE CURRENT PICKS</text>
    ${pickBand(GAMES.control, 220, LIME, 'pick-control')}
    ${pickBand(GAMES.frostpunk, 580, '#8cc8ff', 'pick-frost')}
    ${pickBand(GAMES.beforeEyes, 940, GOLD, 'pick-eyes')}`;
}

function finalScene() {
  return `
    ${image('final-shot', GAMES.quake, 'shot', 0, 0, 1080, 1180, { radius: 0, shadow: false })}
    <rect x="0" y="0" width="1080" height="1180" fill="#0508063d"/>
    ${image('final-cover', GAMES.quake, 'cover', 102, 190, 396, 940, { rotate: -4, border: LIME })}
    <g transform="translate(480 290)" filter="url(#shadow)">
      <rect width="540" height="700" rx="42" fill="#050806e5" stroke="${LINE}" stroke-width="3"/>
      <text x="42" y="100" fill="${WHITE}" font-family="${FONT}" font-size="56" font-weight="900">THE BETTER</text>
      <text x="42" y="166" fill="${LIME}" font-family="${FONT}" font-size="56" font-weight="900">DEAL WON.</text>
      <text x="42" y="284" fill="${MUTED}" font-family="${FONT}" font-size="27" font-weight="900">QUAKE · 60% OFF</text>
      <text x="42" y="390" fill="${LIME}" font-family="${FONT}" font-size="116" font-weight="900">86</text>
      <text x="42" y="438" fill="${MUTED}" font-family="${FONT}" font-size="24" font-weight="900">DEAL SCORE</text>
      <rect x="42" y="512" width="456" height="112" rx="56" fill="${LIME}"/>
      <text x="270" y="584" fill="${BG}" text-anchor="middle" font-family="${FONT}" font-size="32" font-weight="900">THELOOTRADAR.COM</text>
    </g>`;
}

function sceneBody(scene) {
  switch (scene.id) {
    case 'hook': return hookScene();
    case 'badge': return badgeScene();
    case 'questions': return questionsScene();
    case 'reviews': return reviewsScene();
    case 'value': return valueScene();
    case 'confidence': return confidenceScene();
    case 'score': return scoreScene();
    case 'comparison': return comparisonScene();
    case 'rule': return ruleScene();
    case 'picks': return picksScene();
    case 'final': return finalScene();
    default: throw new Error(`Unknown scene: ${scene.id}`);
  }
}

function sceneSvg(scene, index) {
  return Buffer.from(`
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      ${defs()}
      ${baseBackground(scene.bg)}
      ${sceneBody(scene)}
      ${brand(index)}
      ${captions(scene.caption)}
    </svg>`);
}

async function buildScenes() {
  const paths = [];
  for (const [index, scene] of SCENES.entries()) {
    const target = path.join(sceneDir, `${String(index + 1).padStart(2, '0')}-${scene.id}.png`);
    await sharp(sceneSvg(scene, index)).png({ compressionLevel: 9 }).toFile(target);
    paths.push(target);
  }
  return paths;
}

async function contactSheet(scenePaths) {
  const tileW = 270;
  const tileH = 480;
  const columns = 4;
  const rows = Math.ceil(scenePaths.length / columns);
  const inputs = await Promise.all(scenePaths.map(file => sharp(file).resize(tileW, tileH).png().toBuffer()));
  await sharp({
    create: { width: tileW * columns, height: tileH * rows, channels: 4, background: BG }
  }).composite(inputs.map((input, index) => ({
    input,
    left: index % columns * tileW,
    top: Math.floor(index / columns) * tileH
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
    const fadeOut = Math.max(0, duration - 0.11);
    const zoomDirection = index % 3 === 0 ? 1 : -1;
    return `[${index}:v]scale=1160:2062,crop=1080:1920:x='40+${zoomDirection}*11*sin(t*0.58+${index})':y='71+10*cos(t*0.46+${index})',setsar=1,fps=30,trim=duration=${duration.toFixed(6)},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.06,fade=t=out:st=${fadeOut.toFixed(6)}:d=0.11[v${index}]`;
  });
  filters.push(`${scenePaths.map((_, index) => `[v${index}]`).join('')}concat=n=${scenePaths.length}:v=1:a=0[vout]`);
  filters.push(`[${scenePaths.length}:a]loudnorm=I=-16:TP=-1.5:LRA=9[aout]`);
  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-ar', '44100', '-b:a', '192k',
    '-shortest', '-movflags', '+faststart', outputPath
  );
  const result = spawnSync('ffmpeg', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`FFmpeg failed: ${result.error?.message || result.stderr || `exit ${result.status}`}`);
}

function extract(time, name) {
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', String(time), '-i', outputPath,
    '-frames:v', '1', '-q:v', '2', path.join(previewDir, name)
  ], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`Preview failed: ${result.error?.message || result.stderr}`);
}

function thumbnailSvg(width, height, vertical) {
  const quake = media(GAMES.quake);
  const dead = media(GAMES.deadIsland);
  if (vertical) {
    return Buffer.from(`
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        ${defs()}<rect width="${width}" height="${height}" fill="${BG}"/>
        <image href="${quake.shot}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" filter="url(#blur)" opacity=".62"/>
        <rect width="${width}" height="${height}" fill="url(#fade)"/>
        ${image('thumb-q', GAMES.quake, 'cover', 84, 230, 470, 1090, { rotate: -4, border: LIME })}
        ${image('thumb-d', GAMES.deadIsland, 'cover', 570, 270, 420, 990, { rotate: 4, border: GOLD })}
        <text x="540" y="1460" fill="${LIME}" text-anchor="middle" font-family="${FONT}" font-size="154" font-weight="900">60%</text>
        <text x="540" y="1588" fill="${WHITE}" text-anchor="middle" font-family="${FONT}" font-size="82" font-weight="900">BEATS 90%?</text>
        <text x="540" y="1710" fill="${MUTED}" text-anchor="middle" font-family="${FONT}" font-size="38" font-weight="900">THE DISCOUNT IS NOT THE VERDICT</text>
        <text x="540" y="1825" fill="${WHITE}" text-anchor="middle" font-family="${FONT}" font-size="36" font-weight="900">Loot<tspan fill="${LIME}">Radar</tspan></text>
      </svg>`);
  }
  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      ${defs()}<rect width="${width}" height="${height}" fill="${BG}"/>
      <image href="${quake.shot}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity=".72"/>
      <rect width="${width}" height="${height}" fill="url(#sideFade)"/>
      <text x="68" y="90" fill="${WHITE}" font-family="${FONT}" font-size="34" font-weight="900">Loot<tspan fill="${LIME}">Radar</tspan></text>
      <text x="68" y="300" fill="${LIME}" font-family="${FONT}" font-size="158" font-weight="900">60%</text>
      <text x="68" y="412" fill="${WHITE}" font-family="${FONT}" font-size="80" font-weight="900">BEATS 90%?</text>
      <text x="72" y="490" fill="${MUTED}" font-family="${FONT}" font-size="31" font-weight="900">THE DISCOUNT IS NOT THE VERDICT</text>
      <g transform="translate(800 26)">${image('thumb-wide-q', GAMES.quake, 'cover', 0, 0, 430, 668, { rotate: -3, border: LIME })}</g>
      <g transform="translate(1000 114)">${image('thumb-wide-d', GAMES.deadIsland, 'cover', 0, 0, 236, 512, { rotate: 5, border: GOLD })}</g>
    </svg>`);
}

async function thumbnails() {
  await sharp(thumbnailSvg(1280, 720, false)).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(thumbnailPath);
  await sharp(thumbnailSvg(1080, 1920, true)).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(verticalThumbnailPath);
}

async function main() {
  const scenePaths = await buildScenes();
  await contactSheet(scenePaths);
  await thumbnails();
  renderVideo(scenePaths);
  extract(1.0, 'hook.png');
  extract(5.8, 'questions.png');
  extract(9.5, 'reviews.png');
  extract(14.5, 'score.png');
  extract(19.2, 'comparison.png');
  extract(24.5, 'rule.png');
  extract(29.4, 'picks.png');
  extract(32.2, 'final.png');
  console.log(`Rendered ${outputPath}`);
  console.log(`Created ${thumbnailPath}`);
  console.log(`Created ${verticalThumbnailPath}`);
  console.log(`Contact sheet ${contactSheetPath}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
