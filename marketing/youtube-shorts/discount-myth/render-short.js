'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');

const WIDTH = 1080;
const HEIGHT = 1920;
const INK = '#080c0a';
const PANEL = '#111814';
const PANEL_LIGHT = '#17211b';
const LIME = '#b9f55d';
const LIME_DARK = '#88cd36';
const WHITE = '#f4f7f5';
const MUTED = '#a8b3ac';
const SUBTLE = '#6f7b74';
const RED = '#f07870';
const GOLD = '#f1b85c';
const FONT = 'Segoe UI, Arial, sans-serif';

const outputDir = __dirname;
const generatedDir = path.join(outputDir, 'generated');
const artDir = path.join(generatedDir, 'art');
const sceneDir = path.join(generatedDir, 'scenes');
const snapshotPath = path.join(outputDir, 'deals-2026-07-29.json');
const narrationPath = path.join(outputDir, 'lootradar-discount-myth-v3.mp3');
const outputPath = path.join(outputDir, 'lootradar-discount-myth-v3.mp4');
const contactSheetPath = path.join(generatedDir, 'contact-sheet.png');
const logoPath = path.resolve(
  outputDir,
  '..',
  '..',
  'youtube-profile',
  'lootradar-generated-emblem-source.png'
);

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const [spiderMan, neonWhite, itTakesTwo] = snapshot.deals;

const SCENE_TIMINGS = Object.freeze([
  { id: 'hook', duration: 2.708005 },
  { id: 'truth', duration: 3.064761 },
  { id: 'signals', duration: 4.288345 },
  { id: 'comparison', duration: 5.259615 },
  { id: 'rule', duration: 2.757324 },
  { id: 'cta', duration: 4.361075 }
]);

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

function formatCount(value) {
  const count = Number(value || 0);
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

function baseSvg(body, definitions = '', includeSolidBackground = true) {
  return Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="pageGlow" cx="80%" cy="8%" r="78%">
          <stop offset="0" stop-color="#335321" stop-opacity=".58"/>
          <stop offset=".46" stop-color="#142016" stop-opacity=".28"/>
          <stop offset="1" stop-color="${INK}" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="limePanel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#26391e"/>
          <stop offset="1" stop-color="#152016"/>
        </linearGradient>
        <linearGradient id="artFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${INK}" stop-opacity=".02"/>
          <stop offset=".62" stop-color="${INK}" stop-opacity=".2"/>
          <stop offset="1" stop-color="${INK}" stop-opacity=".92"/>
        </linearGradient>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#000000" flood-opacity=".55"/>
        </filter>
        <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="18" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        ${definitions}
      </defs>
      ${includeSolidBackground ? `<rect width="${WIDTH}" height="${HEIGHT}" fill="${INK}"/>` : ''}
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#pageGlow)"/>
      ${body}
    </svg>
  `);
}

function brandHeader(kicker) {
  return `
    <g>
      <circle cx="102" cy="101" r="34" fill="none" stroke="${LIME}" stroke-width="6"/>
      <circle cx="102" cy="101" r="18" fill="none" stroke="${LIME}" stroke-width="5" opacity=".76"/>
      <path d="M102 101 L128 75" stroke="${LIME}" stroke-width="6" stroke-linecap="round"/>
      <circle cx="128" cy="75" r="6" fill="${WHITE}"/>
      <text x="158" y="91" fill="${WHITE}" font-family="${FONT}" font-size="38" font-weight="800" letter-spacing="-1">Loot<tspan fill="${LIME}">Radar</tspan></text>
      <text x="158" y="126" fill="${MUTED}" font-family="${FONT}" font-size="18" font-weight="700" letter-spacing="3">${escapeXml(kicker)}</text>
      <line x1="72" y1="162" x2="1008" y2="162" stroke="#26312b" stroke-width="2"/>
    </g>
  `;
}

function radarDecoration(opacity = 0.13) {
  return `
    <g fill="none" stroke="${LIME}" opacity="${opacity}">
      <circle cx="900" cy="1170" r="350" stroke-width="4"/>
      <circle cx="900" cy="1170" r="250" stroke-width="4"/>
      <circle cx="900" cy="1170" r="150" stroke-width="4"/>
      <path d="M900 1170 L1110 960" stroke-width="6"/>
      <circle cx="986" cy="1084" r="8" fill="${LIME}"/>
    </g>
  `;
}

function captionBand(lines, accentLast = false) {
  const spans = lines.map((line, index) => {
    const color = accentLast && index === lines.length - 1 ? LIME : WHITE;
    return `<tspan x="104" dy="${index === 0 ? 0 : 58}" fill="${color}">${escapeXml(line)}</tspan>`;
  }).join('');

  return `
    <g filter="url(#shadow)">
      <rect x="72" y="1604" width="866" height="218" rx="34" fill="#0e1411" stroke="#2b3831" stroke-width="2"/>
      <rect x="72" y="1604" width="10" height="218" rx="5" fill="${LIME}"/>
      <text x="104" y="1680" fill="${WHITE}" font-family="${FONT}" font-size="43" font-weight="800" letter-spacing="-1">${spans}</text>
    </g>
  `;
}

function footerDisclaimer() {
  return `
    <text x="72" y="1880" fill="${SUBTLE}" font-family="${FONT}" font-size="21" font-weight="600">${escapeXml(snapshot.disclaimer)}</text>
  `;
}

async function saveScene(name, svg, composites = [], overlays = []) {
  const target = path.join(sceneDir, name);
  const base = sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: INK
    }
  });
  await base
    .composite([
      ...composites,
      { input: svg, left: 0, top: 0 },
      ...overlays
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(target);
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
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  return target;
}

async function roundedArtwork(artPath, width, height, options = {}) {
  const image = await sharp(artPath)
    .resize(width, height, { fit: 'cover', position: options.position || 'centre' })
    .modulate({
      brightness: options.brightness || 0.82,
      saturation: options.saturation || 1.06
    })
    .png()
    .toBuffer();
  const radius = options.radius || 34;
  const mask = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/>
    </svg>
  `);
  return sharp(image)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function buildHook() {
  const body = `
    ${brandHeader('THE DISCOUNT MYTH')}
    ${radarDecoration()}
    <text x="72" y="340" fill="${MUTED}" font-family="${FONT}" font-size="27" font-weight="800" letter-spacing="5">THE NUMBER THAT GRABS ATTENTION</text>
    <text x="72" y="490" fill="${WHITE}" font-family="${FONT}" font-size="94" font-weight="900" letter-spacing="-5">
      <tspan x="72">IT LOOKS</tspan>
      <tspan x="72" dy="98" fill="${LIME}">INCREDIBLE.</tspan>
    </text>
    <g transform="translate(540 1015)" filter="url(#shadow)">
      <circle r="318" fill="#111713" stroke="#303d35" stroke-width="3"/>
      <circle r="270" fill="none" stroke="${GOLD}" stroke-width="24" stroke-dasharray="1140 560" stroke-linecap="round" transform="rotate(-36)"/>
      <circle r="222" fill="#171d19" stroke="#363f3a" stroke-width="3"/>
      <text x="0" y="-12" fill="${WHITE}" text-anchor="middle" font-family="${FONT}" font-size="165" font-weight="900" letter-spacing="-9">90%</text>
      <text x="0" y="105" fill="${GOLD}" text-anchor="middle" font-family="${FONT}" font-size="70" font-weight="900" letter-spacing="8">OFF</text>
      <circle cx="196" cy="-178" r="20" fill="${LIME}" filter="url(#softGlow)"/>
    </g>
    ${captionBand(['A ninety percent discount', 'looks incredible.'], true)}
  `;
  return saveScene('01-hook.png', baseSvg(body));
}

async function buildTruth() {
  const body = `
    ${brandHeader('PRICE IS ONLY ONE SIGNAL')}
    <text x="72" y="352" fill="${WHITE}" font-family="${FONT}" font-size="88" font-weight="900" letter-spacing="-5">
      <tspan x="72">THE BADGE DOES</tspan>
      <tspan x="72" dy="94">NOT RATE</tspan>
      <tspan x="72" dy="94" fill="${LIME}">THE GAME.</tspan>
    </text>
    <g transform="translate(72 760)" filter="url(#shadow)">
      <rect width="936" height="560" rx="46" fill="${PANEL}" stroke="#303b35" stroke-width="3"/>
      <text x="66" y="118" fill="${GOLD}" font-family="${FONT}" font-size="104" font-weight="900">90% OFF</text>
      <line x1="60" y1="160" x2="876" y2="160" stroke="#2d3932" stroke-width="2"/>
      <g transform="translate(62 222)">
        <rect width="812" height="92" rx="25" fill="#171f1b"/>
        <text x="34" y="59" fill="${MUTED}" font-family="${FONT}" font-size="32" font-weight="700">GAME QUALITY</text>
        <text x="766" y="60" fill="${RED}" text-anchor="end" font-family="${FONT}" font-size="40" font-weight="900">?</text>
      </g>
      <g transform="translate(62 334)">
        <rect width="812" height="92" rx="25" fill="#171f1b"/>
        <text x="34" y="59" fill="${MUTED}" font-family="${FONT}" font-size="32" font-weight="700">PLAYER REVIEWS</text>
        <text x="766" y="60" fill="${RED}" text-anchor="end" font-family="${FONT}" font-size="40" font-weight="900">?</text>
      </g>
      <g transform="translate(62 446)">
        <rect width="812" height="92" rx="25" fill="#171f1b"/>
        <text x="34" y="59" fill="${MUTED}" font-family="${FONT}" font-size="32" font-weight="700">REVIEW CONFIDENCE</text>
        <text x="766" y="60" fill="${RED}" text-anchor="end" font-family="${FONT}" font-size="40" font-weight="900">?</text>
      </g>
    </g>
    ${captionBand(['That number does not tell you', 'if the game is actually good.'], true)}
  `;
  return saveScene('02-truth.png', baseSvg(body));
}

function signalRow(y, number, label, description, fillWidth) {
  return `
    <g transform="translate(72 ${y})" filter="url(#shadow)">
      <rect width="936" height="202" rx="38" fill="${number === 2 ? 'url(#limePanel)' : PANEL}" stroke="${number === 2 ? LIME_DARK : '#303b35'}" stroke-width="3"/>
      <circle cx="102" cy="101" r="55" fill="${number === 2 ? LIME : '#202b25'}"/>
      <text x="102" y="119" fill="${number === 2 ? INK : LIME}" text-anchor="middle" font-family="${FONT}" font-size="47" font-weight="900">${number}</text>
      <text x="190" y="77" fill="${WHITE}" font-family="${FONT}" font-size="42" font-weight="900">${escapeXml(label)}</text>
      <text x="190" y="124" fill="${MUTED}" font-family="${FONT}" font-size="25" font-weight="600">${escapeXml(description)}</text>
      <rect x="190" y="153" width="665" height="11" rx="6" fill="#27322c"/>
      <rect x="190" y="153" width="${fillWidth}" height="11" rx="6" fill="${LIME}"/>
    </g>
  `;
}

async function buildSignals() {
  const body = `
    ${brandHeader('HOW LOOTRADAR RANKS DEALS')}
    <text x="72" y="350" fill="${WHITE}" font-family="${FONT}" font-size="84" font-weight="900" letter-spacing="-5">
      <tspan x="72">CHECK THE</tspan>
      <tspan x="72" dy="92" fill="${LIME}">EVIDENCE.</tspan>
    </text>
    ${signalRow(590, 1, 'PLAYER REVIEWS', 'What players think', 566)}
    ${signalRow(814, 2, 'PRICE VALUE', 'What the current price buys', 628)}
    ${signalRow(1038, 3, 'REVIEW CONFIDENCE', 'How much evidence exists', 602)}
    <g transform="translate(72 1302)">
      <circle cx="36" cy="36" r="34" fill="${LIME}"/>
      <path d="M20 37 L33 50 L54 23" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="92" y="48" fill="${WHITE}" font-family="${FONT}" font-size="35" font-weight="800">THE DISCOUNT NEVER DECIDES ALONE</text>
    </g>
    ${captionBand(['Reviews. Price value.', 'Review confidence.'], true)}
  `;
  return saveScene('03-signals.png', baseSvg(body));
}

async function buildComparison(spiderArtPath) {
  const art = await roundedArtwork(spiderArtPath, 460, 300, {
    radius: 30,
    brightness: 0.88
  });
  const artLayer = await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: art, left: 548, top: 614 }])
    .png()
    .toBuffer();

  const body = `
    ${brandHeader('A CURRENT QUALITY-FIRST EXAMPLE')}
    <text x="72" y="328" fill="${WHITE}" font-family="${FONT}" font-size="73" font-weight="900" letter-spacing="-4">
      <tspan x="72">THE BETTER GAME CAN</tspan>
      <tspan x="72" dy="82">HAVE THE <tspan fill="${LIME}">SMALLER CUT.</tspan></tspan>
    </text>
    <g transform="translate(72 614)" filter="url(#shadow)">
      <rect width="430" height="704" rx="42" fill="${PANEL}" stroke="#374039" stroke-width="3"/>
      <text x="42" y="72" fill="${MUTED}" font-family="${FONT}" font-size="22" font-weight="800" letter-spacing="3">DISCOUNT-ONLY PICK</text>
      <text x="42" y="188" fill="${GOLD}" font-family="${FONT}" font-size="104" font-weight="900">90%</text>
      <text x="42" y="244" fill="${GOLD}" font-family="${FONT}" font-size="40" font-weight="900" letter-spacing="5">OFF</text>
      <line x1="42" y1="286" x2="388" y2="286" stroke="#303a35" stroke-width="2"/>
      <text x="42" y="356" fill="${MUTED}" font-family="${FONT}" font-size="21" font-weight="700">GAME QUALITY</text>
      <text x="388" y="358" fill="${RED}" text-anchor="end" font-family="${FONT}" font-size="23" font-weight="900">NOT SHOWN</text>
      <text x="42" y="434" fill="${MUTED}" font-family="${FONT}" font-size="21" font-weight="700">REVIEWS</text>
      <text x="388" y="436" fill="${RED}" text-anchor="end" font-family="${FONT}" font-size="23" font-weight="900">NOT SHOWN</text>
      <text x="42" y="512" fill="${MUTED}" font-family="${FONT}" font-size="21" font-weight="700">CONFIDENCE</text>
      <text x="388" y="514" fill="${RED}" text-anchor="end" font-family="${FONT}" font-size="23" font-weight="900">NOT SHOWN</text>
      <rect x="42" y="584" width="346" height="78" rx="24" fill="#251a18" stroke="#65332e" stroke-width="2"/>
      <text x="215" y="635" fill="${RED}" text-anchor="middle" font-family="${FONT}" font-size="28" font-weight="900">BADGE IS NOT PROOF</text>
    </g>
    <g transform="translate(526 594)" filter="url(#shadow)">
      <rect width="482" height="744" rx="42" fill="url(#limePanel)" stroke="${LIME_DARK}" stroke-width="4"/>
      <rect x="22" y="338" width="438" height="1" fill="#3b4a3f"/>
      <text x="28" y="392" fill="${LIME}" font-family="${FONT}" font-size="19" font-weight="900" letter-spacing="2">EPIC GAMES STORE</text>
      <text x="28" y="448" fill="${WHITE}" font-family="${FONT}" font-size="37" font-weight="900">SPIDER-MAN</text>
      <text x="28" y="490" fill="${WHITE}" font-family="${FONT}" font-size="37" font-weight="900">REMASTERED</text>
      <text x="28" y="576" fill="${LIME}" font-family="${FONT}" font-size="74" font-weight="900">$${spiderMan.salePrice.toFixed(2)}</text>
      <text x="298" y="554" fill="${MUTED}" font-family="${FONT}" font-size="28" font-weight="700">$${spiderMan.normalPrice.toFixed(2)}</text>
      <line x1="294" y1="544" x2="410" y2="544" stroke="${RED}" stroke-width="5"/>
      <text x="28" y="650" fill="${WHITE}" font-family="${FONT}" font-size="29" font-weight="800">${spiderMan.steamRatingPercent}% POSITIVE</text>
      <text x="28" y="690" fill="${MUTED}" font-family="${FONT}" font-size="24" font-weight="700">${formatCount(spiderMan.steamRatingCount)} ENGLISH REVIEWS</text>
      <rect x="298" y="622" width="138" height="78" rx="25" fill="${LIME}"/>
      <text x="367" y="653" fill="${INK}" text-anchor="middle" font-family="${FONT}" font-size="18" font-weight="900">DEAL SCORE</text>
      <text x="367" y="689" fill="${INK}" text-anchor="middle" font-family="${FONT}" font-size="35" font-weight="900">${spiderMan.dealScore}</text>
    </g>
    ${captionBand(['A great game at sixty percent off', 'can outrank a weak game at ninety.'], true)}
    ${footerDisclaimer()}
  `;
  const artOverlay = baseSvg(`
    <rect x="548" y="614" width="460" height="300" rx="30" fill="url(#artFade)"/>
    <rect x="548" y="614" width="460" height="300" rx="30" fill="none" stroke="#50604f" stroke-width="3"/>
    <rect x="554" y="622" width="138" height="52" rx="26" fill="${LIME}"/>
    <text x="623" y="657" fill="${INK}" text-anchor="middle" font-family="${FONT}" font-size="24" font-weight="900">60% OFF</text>
  `, '', false);
  return saveScene(
    '04-comparison.png',
    baseSvg(body),
    [],
    [
      { input: artLayer, left: 0, top: 0 },
      { input: artOverlay, left: 0, top: 0 }
    ]
  );
}

async function buildRule() {
  const body = `
    ${brandHeader('THE RULE TO REMEMBER')}
    ${radarDecoration(0.17)}
    <text x="72" y="390" fill="${MUTED}" font-family="${FONT}" font-size="28" font-weight="800" letter-spacing="5">THE SHORT VERSION</text>
    <text x="72" y="590" fill="${WHITE}" font-family="${FONT}" font-size="112" font-weight="900" letter-spacing="-7">
      <tspan x="72">BUY THE</tspan>
      <tspan x="72" dy="118" fill="${LIME}">BETTER GAME.</tspan>
    </text>
    <g transform="translate(72 910)" filter="url(#shadow)">
      <rect width="936" height="382" rx="48" fill="${PANEL}" stroke="#303b35" stroke-width="3"/>
      <g transform="translate(70 78)">
        <circle cx="88" cy="88" r="82" fill="#1d2e19" stroke="${LIME_DARK}" stroke-width="4"/>
        <path d="M50 90 L78 119 L129 55" fill="none" stroke="${LIME}" stroke-width="19" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="220" y="74" fill="${WHITE}" font-family="${FONT}" font-size="49" font-weight="900">GAME EVIDENCE</text>
        <text x="220" y="129" fill="${MUTED}" font-family="${FONT}" font-size="28" font-weight="700">Quality, value, confidence</text>
      </g>
      <line x1="70" y1="262" x2="866" y2="262" stroke="#2b3530" stroke-width="2"/>
      <text x="70" y="329" fill="${RED}" font-family="${FONT}" font-size="34" font-weight="900">NOT THE BIGGEST PERCENTAGE</text>
    </g>
    ${captionBand(['Buy the better game,', 'not the bigger percentage.'], true)}
  `;
  return saveScene('05-rule.png', baseSvg(body));
}

async function buildCta(artworkPaths) {
  const thumbs = await Promise.all(
    artworkPaths.map(art => roundedArtwork(art, 220, 124, {
      radius: 22,
      brightness: 0.9
    }))
  );
  const thumbnailLayer = await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(thumbs.map((input, index) => ({
      input,
      left: 92,
      top: 650 + index * 202
    })))
    .png()
    .toBuffer();

  const cards = snapshot.deals.map((deal, index) => {
    const y = 630 + index * 202;
    return `
      <g transform="translate(72 ${y})" filter="url(#shadow)">
        <rect width="936" height="174" rx="34" fill="${index === 0 ? 'url(#limePanel)' : PANEL}" stroke="${index === 0 ? LIME_DARK : '#303b35'}" stroke-width="3"/>
        <text x="252" y="54" fill="${WHITE}" font-family="${FONT}" font-size="${deal.displayTitle.length > 16 ? 27 : 32}" font-weight="900">${escapeXml(deal.displayTitle)}</text>
        <text x="252" y="98" fill="${MUTED}" font-family="${FONT}" font-size="23" font-weight="700">${escapeXml(deal.storeName.toUpperCase())}</text>
        <text x="252" y="143" fill="${LIME}" font-family="${FONT}" font-size="30" font-weight="900">${deal.steamRatingPercent}% POSITIVE</text>
        <text x="888" y="84" fill="${LIME}" text-anchor="end" font-family="${FONT}" font-size="48" font-weight="900">$${deal.salePrice.toFixed(2)}</text>
        <text x="888" y="129" fill="${MUTED}" text-anchor="end" font-family="${FONT}" font-size="23" font-weight="800">SAVE ${deal.savingsPercent}%</text>
      </g>
    `;
  }).join('');

  const body = `
    ${brandHeader('CURRENT QUALITY-FIRST PICKS')}
    <text x="540" y="350" fill="${WHITE}" text-anchor="middle" font-family="${FONT}" font-size="78" font-weight="900" letter-spacing="-4">FIND TODAY&apos;S</text>
    <text x="540" y="436" fill="${LIME}" text-anchor="middle" font-family="${FONT}" font-size="78" font-weight="900" letter-spacing="-4">BETTER DEALS.</text>
    <text x="540" y="515" fill="${MUTED}" text-anchor="middle" font-family="${FONT}" font-size="29" font-weight="700">Quality, price value, and review confidence</text>
    ${cards}
    <g filter="url(#shadow)">
      <rect x="146" y="1318" width="788" height="126" rx="63" fill="${LIME}"/>
      <text x="540" y="1397" fill="${INK}" text-anchor="middle" font-family="${FONT}" font-size="44" font-weight="900">THELOOTRADAR.COM</text>
    </g>
    <text x="540" y="1504" fill="${WHITE}" text-anchor="middle" font-family="${FONT}" font-size="27" font-weight="800" letter-spacing="3">LINK ON OUR CHANNEL</text>
    ${captionBand(["Find today's quality-first deals", 'at thelootradar.com.'], true)}
    ${footerDisclaimer()}
  `;

  return saveScene(
    '06-cta.png',
    baseSvg(body),
    [],
    [{ input: thumbnailLayer, left: 0, top: 0 }]
  );
}

async function createContactSheet(scenePaths) {
  const tiles = await Promise.all(scenePaths.map(scene => (
    sharp(scene).resize(360, 640, { fit: 'cover' }).png().toBuffer()
  )));
  await sharp({
    create: {
      width: 1080,
      height: 1280,
      channels: 4,
      background: INK
    }
  })
    .composite(tiles.map((input, index) => ({
      input,
      left: (index % 3) * 360,
      top: Math.floor(index / 3) * 640
    })))
    .png({ compressionLevel: 9 })
    .toFile(contactSheetPath);
  return contactSheetPath;
}

function renderVideo(scenePaths) {
  const totalDuration = SCENE_TIMINGS.reduce((sum, scene) => sum + scene.duration, 0);
  const args = ['-y'];
  scenePaths.forEach((scene, index) => {
    args.push(
      '-loop', '1',
      '-framerate', '30',
      '-t', String(SCENE_TIMINGS[index].duration),
      '-i', scene
    );
  });
  args.push('-i', narrationPath);

  const filters = scenePaths.map((_, index) => {
    const duration = SCENE_TIMINGS[index].duration;
    const zoom = index % 2 === 0 ? '1.025' : '1.018';
    return (
      `[${index}:v]scale=1116:1984,crop=1080:1920:` +
      `x='18+8*sin(t*0.52+${index})':y='32+7*cos(t*0.43+${index})',` +
      `scale=iw*${zoom}:ih*${zoom},crop=1080:1920,` +
      `setsar=1,fps=30,trim=duration=${duration},setpts=PTS-STARTPTS[v${index}]`
    );
  });
  filters.push(
    `${scenePaths.map((_, index) => `[v${index}]`).join('')}concat=n=${scenePaths.length}:v=1:a=0,` +
    `fade=t=in:st=0:d=0.1,fade=t=out:st=${(totalDuration - 0.28).toFixed(3)}:d=0.28[vout]`
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
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=10',
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
  if (!fs.existsSync(logoPath)) throw new Error('LootRadar emblem is missing.');
  if (!Array.isArray(snapshot.deals) || snapshot.deals.length !== 3) {
    throw new Error('The verified snapshot must contain exactly three current deals.');
  }

  const artwork = await Promise.all(snapshot.deals.map(downloadArtwork));
  const scenes = [
    await buildHook(),
    await buildTruth(),
    await buildSignals(),
    await buildComparison(artwork[0]),
    await buildRule(),
    await buildCta(artwork)
  ];
  const contactSheet = await createContactSheet(scenes);
  const video = renderVideo(scenes);

  console.log(`Rendered ${video}`);
  console.log(`Contact sheet ${contactSheet}`);
  scenes.forEach(scene => console.log(`Scene ${scene}`));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
