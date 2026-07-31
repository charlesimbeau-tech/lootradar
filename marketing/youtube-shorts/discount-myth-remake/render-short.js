'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');

const WIDTH = 1080;
const HEIGHT = 1920;
const BG = '#070a08';
const PANEL = '#101713';
const PANEL_ALT = '#162019';
const LINE = '#2a372f';
const LIME = '#b9f55d';
const LIME_SOFT = '#8bcf3d';
const WHITE = '#f5f7f5';
const MUTED = '#a4afa7';
const SUBTLE = '#69766e';
const GOLD = '#f3b85a';
const RED = '#ee766f';
const FONT = 'Segoe UI, Arial, sans-serif';

const root = __dirname;
const generatedDir = path.join(root, 'generated');
const sceneDir = path.join(generatedDir, 'scenes');
const previewDir = path.join(generatedDir, 'previews');
const narrationPath = path.join(root, 'lootradar-discount-myth-remake-narration.mp3');
const outputPath = path.join(root, 'lootradar-discount-myth-remake.mp4');
const contactSheetPath = path.join(generatedDir, 'contact-sheet.png');

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
  {
    id: 'badge',
    kicker: 'THE NUMBER THAT GRABS ATTENTION',
    caption: ['A NINETY PERCENT', 'DISCOUNT...']
  },
  {
    id: 'priority',
    kicker: 'BIGGER IS NOT AUTOMATICALLY BETTER',
    caption: ["...ISN'T ALWAYS THE MOST", 'IMPORTANT FACTOR WHEN SHOPPING.']
  },
  {
    id: 'unknowns',
    kicker: 'THE BADGE LEAVES QUESTIONS',
    caption: ['THAT NUMBER DOES NOT TELL YOU', 'IF THE GAME IS ACTUALLY GOOD.']
  },
  {
    id: 'reviews',
    kicker: 'SIGNAL 01',
    caption: ['LOOTRADAR CHECKS', 'PLAYER REVIEWS,']
  },
  {
    id: 'value',
    kicker: 'SIGNAL 02',
    caption: ['PRICE VALUE,']
  },
  {
    id: 'confidence',
    kicker: 'SIGNAL 03',
    caption: ['AND REVIEW CONFIDENCE,']
  },
  {
    id: 'score',
    kicker: 'THE SIGNALS BECOME A RANKING',
    caption: ['THEN GENERATES A SCORE', 'SHOWING THE REAL IMPACT', 'OF YOUR DISCOUNT.']
  },
  {
    id: 'comparison',
    kicker: 'ILLUSTRATIVE COMPARISON',
    caption: ['A GREAT GAME AT 60% OFF', 'CAN OUTRANK A WEAKLY REVIEWED', 'GAME AT 90% OFF.']
  },
  {
    id: 'rule',
    kicker: 'THE RULE TO REMEMBER',
    caption: ['BUY THE BETTER GAME,', 'NOT JUST THE BIGGER PERCENTAGE.']
  },
  {
    id: 'cta',
    kicker: 'SHOP WITH BETTER SIGNALS',
    caption: ["FIND TODAY'S QUALITY-FIRST", 'PC GAME DEALS AT', 'THELOOTRADAR.COM,']
  },
  {
    id: 'final',
    kicker: 'QUALITY-FIRST PC GAME DEALS',
    caption: ['AND START BEING A MORE', 'CONFIDENT SHOPPER TODAY.']
  }
].map((scene, index) => ({
  ...scene,
  start: BOUNDARIES[index],
  end: BOUNDARIES[index + 1],
  duration: BOUNDARIES[index + 1] - BOUNDARIES[index]
})));

fs.mkdirSync(sceneDir, { recursive: true });
fs.mkdirSync(previewDir, { recursive: true });

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function brandHeader(kicker, index) {
  const bars = SCENES.map((_, barIndex) => {
    const fill = barIndex <= index ? LIME : '#263128';
    return `<rect x="${72 + barIndex * 86}" y="166" width="68" height="7" rx="4" fill="${fill}"/>`;
  }).join('');
  return `
    <g>
      <circle cx="101" cy="91" r="31" fill="none" stroke="${LIME}" stroke-width="5"/>
      <circle cx="101" cy="91" r="14" fill="none" stroke="${LIME}" stroke-width="4" opacity=".8"/>
      <path d="M101 91 L126 66" stroke="${LIME}" stroke-width="5" stroke-linecap="round"/>
      <circle cx="126" cy="66" r="5" fill="${WHITE}"/>
      <text x="151" y="85" fill="${WHITE}" font-family="${FONT}" font-size="36" font-weight="800">Loot<tspan fill="${LIME}">Radar</tspan></text>
      <text x="151" y="121" fill="${MUTED}" font-family="${FONT}" font-size="17" font-weight="700" letter-spacing="2.6">${escapeXml(kicker)}</text>
      ${bars}
    </g>
  `;
}

function radarField(opacity = 0.12) {
  return `
    <g transform="translate(800 910)" fill="none" stroke="${LIME}" opacity="${opacity}">
      <circle r="400" stroke-width="3"/>
      <circle r="290" stroke-width="3"/>
      <circle r="180" stroke-width="3"/>
      <line x1="-430" y1="0" x2="430" y2="0" stroke-width="2"/>
      <line x1="0" y1="-430" x2="0" y2="430" stroke-width="2"/>
      <path d="M0 0 L302 -302" stroke-width="8" stroke-linecap="round"/>
      <circle cx="198" cy="-198" r="10" fill="${LIME}"/>
    </g>
  `;
}

function captionBand(lines) {
  const lineHeight = 56;
  const firstY = lines.length === 3 ? 1649 : lines.length === 2 ? 1677 : 1705;
  const tspans = lines.map((line, index) => (
    `<tspan x="106" dy="${index === 0 ? 0 : lineHeight}" fill="${index === lines.length - 1 ? LIME : WHITE}">${escapeXml(line)}</tspan>`
  )).join('');
  return `
    <g filter="url(#shadow)">
      <rect x="72" y="1572" width="872" height="236" rx="34" fill="#0d1310" stroke="${LINE}" stroke-width="2"/>
      <rect x="72" y="1572" width="10" height="236" rx="5" fill="${LIME}"/>
      <text x="106" y="${firstY}" fill="${WHITE}" font-family="${FONT}" font-size="43" font-weight="850" letter-spacing="-.5">${tspans}</text>
    </g>
  `;
}

function baseSvg(scene, index, body) {
  return Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid" width="72" height="72" patternUnits="userSpaceOnUse">
          <path d="M72 0 L0 0 0 72" fill="none" stroke="#1d2821" stroke-width="1"/>
        </pattern>
        <radialGradient id="glow" cx="82%" cy="12%" r="80%">
          <stop offset="0" stop-color="#365523" stop-opacity=".48"/>
          <stop offset=".48" stop-color="#132017" stop-opacity=".2"/>
          <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="limePanel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#263b1e"/>
          <stop offset="1" stop-color="#121a14"/>
        </linearGradient>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#000" flood-opacity=".55"/>
        </filter>
        <filter id="glowSoft" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="16" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="${BG}"/>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)" opacity=".46"/>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>
      ${brandHeader(scene.kicker, index)}
      ${body}
      ${captionBand(scene.caption)}
      <text x="72" y="1874" fill="${SUBTLE}" font-family="${FONT}" font-size="19" font-weight="700" letter-spacing="2">THELOOTRADAR.COM</text>
      <text x="1008" y="1874" fill="${SUBTLE}" text-anchor="end" font-family="${FONT}" font-size="19" font-weight="700">${String(index + 1).padStart(2, '0')} / ${SCENES.length}</text>
    </svg>
  `);
}

function badgeScene() {
  return `
    ${radarField(.14)}
    <text x="72" y="344" fill="${MUTED}" font-family="${FONT}" font-size="25" font-weight="800" letter-spacing="4">THE LOUDEST NUMBER ON THE PAGE</text>
    <g transform="translate(540 915)" filter="url(#shadow)">
      <circle r="370" fill="#0e1411" stroke="${LINE}" stroke-width="3"/>
      <circle r="315" fill="none" stroke="${GOLD}" stroke-width="26" stroke-dasharray="1280 700" stroke-linecap="round" transform="rotate(-46)"/>
      <circle r="248" fill="${PANEL_ALT}" stroke="#39463e" stroke-width="3"/>
      <text x="-10" y="26" fill="${WHITE}" text-anchor="middle" font-family="${FONT}" font-size="180" font-weight="900" letter-spacing="-10">90%</text>
      <rect x="-142" y="92" width="284" height="94" rx="47" fill="${GOLD}"/>
      <text x="0" y="155" fill="${BG}" text-anchor="middle" font-family="${FONT}" font-size="49" font-weight="900" letter-spacing="7">OFF</text>
      <circle cx="226" cy="-224" r="18" fill="${LIME}" filter="url(#glowSoft)"/>
    </g>
  `;
}

function priorityScene() {
  return `
    <text x="72" y="374" fill="${WHITE}" font-family="${FONT}" font-size="92" font-weight="900" letter-spacing="-5">
      <tspan x="72">BIGGEST</tspan>
      <tspan x="72" dy="98" fill="${GOLD}">DISCOUNT</tspan>
    </text>
    <g transform="translate(72 640)" filter="url(#shadow)">
      <rect width="936" height="620" rx="48" fill="${PANEL}" stroke="${LINE}" stroke-width="3"/>
      <text x="468" y="120" fill="${RED}" text-anchor="middle" font-family="${FONT}" font-size="78" font-weight="900">IS NOT THE VERDICT</text>
      <line x1="60" y1="164" x2="876" y2="164" stroke="${LINE}" stroke-width="2"/>
      <g transform="translate(60 218)">
        <rect width="816" height="100" rx="26" fill="#18231b"/>
        <circle cx="58" cy="50" r="34" fill="${LIME}"/><text x="58" y="64" fill="${BG}" text-anchor="middle" font-family="${FONT}" font-size="36" font-weight="900">1</text>
        <text x="116" y="63" fill="${WHITE}" font-family="${FONT}" font-size="38" font-weight="850">GAME QUALITY</text>
      </g>
      <g transform="translate(60 336)">
        <rect width="816" height="100" rx="26" fill="#151e18"/>
        <circle cx="58" cy="50" r="34" fill="#253129"/><text x="58" y="64" fill="${LIME}" text-anchor="middle" font-family="${FONT}" font-size="36" font-weight="900">2</text>
        <text x="116" y="63" fill="${WHITE}" font-family="${FONT}" font-size="38" font-weight="850">REVIEW EVIDENCE</text>
      </g>
      <g transform="translate(60 454)">
        <rect width="816" height="100" rx="26" fill="#151e18"/>
        <circle cx="58" cy="50" r="34" fill="#253129"/><text x="58" y="64" fill="${LIME}" text-anchor="middle" font-family="${FONT}" font-size="36" font-weight="900">3</text>
        <text x="116" y="63" fill="${WHITE}" font-family="${FONT}" font-size="38" font-weight="850">PRICE VALUE</text>
      </g>
    </g>
  `;
}

function unknownsScene() {
  const rows = [
    ['GAME QUALITY', 'UNKNOWN'],
    ['PLAYER REVIEWS', 'UNKNOWN'],
    ['REVIEW CONFIDENCE', 'UNKNOWN'],
    ['FIT FOR YOU', 'UNKNOWN']
  ].map((row, index) => `
    <g transform="translate(72 ${600 + index * 154})" filter="url(#shadow)">
      <rect width="936" height="126" rx="30" fill="${index === 0 ? 'url(#limePanel)' : PANEL}" stroke="${index === 0 ? LIME_SOFT : LINE}" stroke-width="3"/>
      <text x="42" y="78" fill="${WHITE}" font-family="${FONT}" font-size="32" font-weight="850">${row[0]}</text>
      <text x="894" y="78" fill="${RED}" text-anchor="end" font-family="${FONT}" font-size="26" font-weight="900" letter-spacing="2">${row[1]}</text>
    </g>
  `).join('');
  return `
    <text x="72" y="366" fill="${WHITE}" font-family="${FONT}" font-size="88" font-weight="900" letter-spacing="-5">
      <tspan x="72">90% OFF</tspan>
      <tspan x="72" dy="96" fill="${LIME}">STILL LEAVES QUESTIONS.</tspan>
    </text>
    ${rows}
  `;
}

function signalScene(active, title, description, meter, number) {
  const items = [
    ['PLAYER REVIEWS', 'What players think'],
    ['PRICE VALUE', 'What the current price buys'],
    ['REVIEW CONFIDENCE', 'How much evidence exists']
  ];
  const cards = items.map((item, index) => {
    const isActive = index === active;
    return `
      <g transform="translate(72 ${610 + index * 222})" filter="url(#shadow)">
        <rect width="936" height="188" rx="38" fill="${isActive ? 'url(#limePanel)' : PANEL}" stroke="${isActive ? LIME_SOFT : LINE}" stroke-width="${isActive ? 4 : 3}"/>
        <circle cx="92" cy="94" r="52" fill="${isActive ? LIME : '#202b24'}"/>
        <text x="92" y="111" fill="${isActive ? BG : LIME}" text-anchor="middle" font-family="${FONT}" font-size="42" font-weight="900">${index + 1}</text>
        <text x="174" y="76" fill="${WHITE}" font-family="${FONT}" font-size="38" font-weight="900">${item[0]}</text>
        <text x="174" y="122" fill="${MUTED}" font-family="${FONT}" font-size="25" font-weight="650">${item[1]}</text>
        <rect x="174" y="146" width="660" height="11" rx="6" fill="#27332b"/>
        <rect x="174" y="146" width="${isActive ? meter : 210 + index * 80}" height="11" rx="6" fill="${isActive ? LIME : '#425046'}"/>
      </g>
    `;
  }).join('');
  return `
    <text x="72" y="352" fill="${MUTED}" font-family="${FONT}" font-size="25" font-weight="800" letter-spacing="4">EVIDENCE LAYER ${String(number).padStart(2, '0')}</text>
    <text x="72" y="458" fill="${WHITE}" font-family="${FONT}" font-size="78" font-weight="900" letter-spacing="-4">${escapeXml(title)}</text>
    <text x="72" y="516" fill="${MUTED}" font-family="${FONT}" font-size="29" font-weight="650">${escapeXml(description)}</text>
    ${cards}
  `;
}

function scoreScene() {
  return `
    ${radarField(.1)}
    <text x="72" y="350" fill="${WHITE}" font-family="${FONT}" font-size="82" font-weight="900" letter-spacing="-5">
      <tspan x="72">THREE SIGNALS.</tspan>
      <tspan x="72" dy="90" fill="${LIME}">ONE CLEARER SCORE.</tspan>
    </text>
    <g transform="translate(72 630)">
      <g filter="url(#shadow)">
        <rect width="300" height="118" rx="30" fill="${PANEL}" stroke="${LINE}" stroke-width="3"/>
        <text x="32" y="50" fill="${MUTED}" font-family="${FONT}" font-size="19" font-weight="800">PLAYER REVIEWS</text>
        <text x="32" y="91" fill="${WHITE}" font-family="${FONT}" font-size="34" font-weight="900">94% POSITIVE</text>
      </g>
      <g transform="translate(318)" filter="url(#shadow)">
        <rect width="300" height="118" rx="30" fill="${PANEL}" stroke="${LINE}" stroke-width="3"/>
        <text x="32" y="50" fill="${MUTED}" font-family="${FONT}" font-size="19" font-weight="800">PRICE VALUE</text>
        <text x="32" y="91" fill="${WHITE}" font-family="${FONT}" font-size="34" font-weight="900">STRONG</text>
      </g>
      <g transform="translate(636)" filter="url(#shadow)">
        <rect width="300" height="118" rx="30" fill="${PANEL}" stroke="${LINE}" stroke-width="3"/>
        <text x="32" y="50" fill="${MUTED}" font-family="${FONT}" font-size="19" font-weight="800">CONFIDENCE</text>
        <text x="32" y="91" fill="${WHITE}" font-family="${FONT}" font-size="34" font-weight="900">HIGH</text>
      </g>
    </g>
    <path d="M222 770 C222 850 440 858 500 922 M540 770 L540 914 M858 770 C858 850 642 858 580 922" fill="none" stroke="${LIME_SOFT}" stroke-width="6" stroke-linecap="round" opacity=".8"/>
    <g transform="translate(540 1130)" filter="url(#shadow)">
      <circle r="270" fill="#101812" stroke="${LINE}" stroke-width="4"/>
      <circle r="220" fill="none" stroke="#28352c" stroke-width="25"/>
      <circle r="220" fill="none" stroke="${LIME}" stroke-width="25" stroke-dasharray="1185 197" stroke-linecap="round" transform="rotate(-90)"/>
      <text x="0" y="-42" fill="${MUTED}" text-anchor="middle" font-family="${FONT}" font-size="25" font-weight="850" letter-spacing="3">DEAL SCORE</text>
      <text x="0" y="95" fill="${WHITE}" text-anchor="middle" font-family="${FONT}" font-size="172" font-weight="900">86</text>
    </g>
  `;
}

function comparisonCard(x, accent, discount, label, quality, reviews, score) {
  return `
    <g transform="translate(${x} 580)" filter="url(#shadow)">
      <rect width="446" height="760" rx="44" fill="${PANEL}" stroke="${accent}" stroke-width="4"/>
      <text x="36" y="68" fill="${MUTED}" font-family="${FONT}" font-size="19" font-weight="850" letter-spacing="2">${escapeXml(label)}</text>
      <text x="36" y="190" fill="${accent}" font-family="${FONT}" font-size="104" font-weight="900">${discount}%</text>
      <text x="36" y="245" fill="${accent}" font-family="${FONT}" font-size="37" font-weight="900" letter-spacing="6">OFF</text>
      <line x1="36" y1="290" x2="410" y2="290" stroke="${LINE}" stroke-width="2"/>
      <text x="36" y="360" fill="${MUTED}" font-family="${FONT}" font-size="21" font-weight="750">GAME QUALITY</text>
      <text x="410" y="362" fill="${WHITE}" text-anchor="end" font-family="${FONT}" font-size="28" font-weight="900">${quality}</text>
      <text x="36" y="432" fill="${MUTED}" font-family="${FONT}" font-size="21" font-weight="750">REVIEW EVIDENCE</text>
      <text x="410" y="434" fill="${WHITE}" text-anchor="end" font-family="${FONT}" font-size="28" font-weight="900">${reviews}</text>
      <rect x="36" y="500" width="374" height="196" rx="30" fill="${accent}" opacity=".12"/>
      <text x="223" y="552" fill="${MUTED}" text-anchor="middle" font-family="${FONT}" font-size="20" font-weight="850" letter-spacing="2">DEAL SCORE</text>
      <text x="223" y="666" fill="${accent}" text-anchor="middle" font-family="${FONT}" font-size="122" font-weight="900">${score}</text>
    </g>
  `;
}

function comparisonScene() {
  return `
    <text x="72" y="344" fill="${WHITE}" font-family="${FONT}" font-size="78" font-weight="900" letter-spacing="-4">
      <tspan x="72">THE SMALLER CUT</tspan>
      <tspan x="72" dy="86" fill="${LIME}">CAN BE THE BETTER DEAL.</tspan>
    </text>
    ${comparisonCard(72, LIME, 60, 'BETTER EVIDENCE', '94 / 100', 'HIGH', 91)}
    ${comparisonCard(562, GOLD, 90, 'WEAKER EVIDENCE', '55 / 100', 'LOW', 66)}
    <text x="540" y="1400" fill="${SUBTLE}" text-anchor="middle" font-family="${FONT}" font-size="20" font-weight="700">ILLUSTRATIVE SCORES SHOW HOW THE RANKING WORKS</text>
  `;
}

function ruleScene() {
  return `
    ${radarField(.16)}
    <text x="72" y="400" fill="${MUTED}" font-family="${FONT}" font-size="26" font-weight="800" letter-spacing="5">THE SHORT VERSION</text>
    <text x="72" y="620" fill="${WHITE}" font-family="${FONT}" font-size="116" font-weight="900" letter-spacing="-7">
      <tspan x="72">BUY</tspan>
      <tspan x="72" dy="120" fill="${LIME}">BETTER.</tspan>
      <tspan x="72" dy="148" fill="${MUTED}" font-size="82">NOT BIGGER.</tspan>
    </text>
    <g transform="translate(72 1110)" filter="url(#shadow)">
      <rect width="936" height="260" rx="46" fill="${PANEL}" stroke="${LINE}" stroke-width="3"/>
      <circle cx="116" cy="130" r="72" fill="${LIME}"/>
      <path d="M78 132 L105 160 L154 99" fill="none" stroke="${BG}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="224" y="112" fill="${WHITE}" font-family="${FONT}" font-size="43" font-weight="900">EVIDENCE FIRST</text>
      <text x="224" y="166" fill="${MUTED}" font-family="${FONT}" font-size="28" font-weight="650">Let the discount strengthen the case.</text>
    </g>
  `;
}

function ctaScene() {
  const rows = [
    ['01', 'GAME QUALITY', 'Worth playing'],
    ['02', 'PRICE VALUE', 'Worth paying'],
    ['03', 'REVIEW CONFIDENCE', 'Enough evidence']
  ].map((row, index) => `
    <g transform="translate(72 ${620 + index * 208})" filter="url(#shadow)">
      <rect width="936" height="174" rx="36" fill="${index === 1 ? 'url(#limePanel)' : PANEL}" stroke="${index === 1 ? LIME_SOFT : LINE}" stroke-width="3"/>
      <circle cx="92" cy="87" r="48" fill="${index === 1 ? LIME : '#202b24'}"/>
      <text x="92" y="101" fill="${index === 1 ? BG : LIME}" text-anchor="middle" font-family="${FONT}" font-size="28" font-weight="900">${row[0]}</text>
      <text x="168" y="72" fill="${WHITE}" font-family="${FONT}" font-size="37" font-weight="900">${row[1]}</text>
      <text x="168" y="119" fill="${MUTED}" font-family="${FONT}" font-size="25" font-weight="650">${row[2]}</text>
    </g>
  `).join('');
  return `
    <text x="72" y="360" fill="${WHITE}" font-family="${FONT}" font-size="82" font-weight="900" letter-spacing="-5">
      <tspan x="72">QUALITY-FIRST</tspan>
      <tspan x="72" dy="90" fill="${LIME}">DEALS, RANKED.</tspan>
    </text>
    ${rows}
    <g transform="translate(72 1300)" filter="url(#shadow)">
      <rect width="936" height="132" rx="66" fill="${LIME}"/>
      <text x="468" y="84" fill="${BG}" text-anchor="middle" font-family="${FONT}" font-size="44" font-weight="900">THELOOTRADAR.COM</text>
    </g>
  `;
}

function finalScene() {
  return `
    ${radarField(.2)}
    <g transform="translate(540 650)">
      <circle r="230" fill="#101712" stroke="${LINE}" stroke-width="4"/>
      <circle r="174" fill="none" stroke="${LIME}" stroke-width="13"/>
      <circle r="84" fill="none" stroke="${LIME}" stroke-width="10" opacity=".75"/>
      <path d="M0 0 L148 -148" stroke="${LIME}" stroke-width="17" stroke-linecap="round"/>
      <circle cx="148" cy="-148" r="18" fill="${WHITE}"/>
    </g>
    <text x="540" y="1050" fill="${WHITE}" text-anchor="middle" font-family="${FONT}" font-size="82" font-weight="900" letter-spacing="-4">SHOP WITH</text>
    <text x="540" y="1145" fill="${LIME}" text-anchor="middle" font-family="${FONT}" font-size="82" font-weight="900" letter-spacing="-4">MORE CONFIDENCE.</text>
    <g filter="url(#shadow)">
      <rect x="126" y="1268" width="828" height="142" rx="71" fill="${LIME}"/>
      <text x="540" y="1357" fill="${BG}" text-anchor="middle" font-family="${FONT}" font-size="45" font-weight="900">THELOOTRADAR.COM</text>
    </g>
  `;
}

function sceneBody(scene) {
  switch (scene.id) {
    case 'badge': return badgeScene();
    case 'priority': return priorityScene();
    case 'unknowns': return unknownsScene();
    case 'reviews': return signalScene(0, 'PLAYER REVIEWS', 'Start with what players think.', 612, 1);
    case 'value': return signalScene(1, 'PRICE VALUE', 'Judge what the current price buys.', 654, 2);
    case 'confidence': return signalScene(2, 'REVIEW CONFIDENCE', 'Check how much evidence exists.', 626, 3);
    case 'score': return scoreScene();
    case 'comparison': return comparisonScene();
    case 'rule': return ruleScene();
    case 'cta': return ctaScene();
    case 'final': return finalScene();
    default: throw new Error(`Unknown scene: ${scene.id}`);
  }
}

async function buildScenes() {
  const paths = [];
  for (const [index, scene] of SCENES.entries()) {
    const target = path.join(sceneDir, `${String(index + 1).padStart(2, '0')}-${scene.id}.png`);
    await sharp(baseSvg(scene, index, sceneBody(scene)))
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(target);
    paths.push(target);
  }
  return paths;
}

async function createContactSheet(scenePaths) {
  const tileWidth = 270;
  const tileHeight = 480;
  const columns = 4;
  const rows = Math.ceil(scenePaths.length / columns);
  const tiles = await Promise.all(scenePaths.map(file => (
    sharp(file).resize(tileWidth, tileHeight, { fit: 'cover' }).png().toBuffer()
  )));
  await sharp({
    create: {
      width: tileWidth * columns,
      height: tileHeight * rows,
      channels: 4,
      background: BG
    }
  })
    .composite(tiles.map((input, index) => ({
      input,
      left: (index % columns) * tileWidth,
      top: Math.floor(index / columns) * tileHeight
    })))
    .png({ compressionLevel: 9 })
    .toFile(contactSheetPath);
}

function renderVideo(scenePaths) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  scenePaths.forEach((file, index) => {
    args.push('-loop', '1', '-framerate', '30', '-t', SCENES[index].duration.toFixed(6), '-i', file);
  });
  args.push('-i', narrationPath);

  const filters = scenePaths.map((_, index) => {
    const duration = SCENES[index].duration;
    const fadeOutStart = Math.max(0, duration - 0.1);
    const direction = index % 2 === 0 ? 1 : -1;
    return (
      `[${index}:v]scale=1120:1992,crop=1080:1920:` +
      `x='20+${direction}*5*sin(t*0.8+${index})':y='36+5*cos(t*0.62+${index})',` +
      `setsar=1,fps=30,trim=duration=${duration.toFixed(6)},setpts=PTS-STARTPTS,` +
      `fade=t=in:st=0:d=0.06,fade=t=out:st=${fadeOutStart.toFixed(6)}:d=0.1[v${index}]`
    );
  });
  filters.push(
    `${scenePaths.map((_, index) => `[v${index}]`).join('')}concat=n=${scenePaths.length}:v=1:a=0[vout]`
  );
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
    '-y',
    '-ss', String(time),
    '-i', outputPath,
    '-frames:v', '1',
    '-q:v', '2',
    path.join(previewDir, name)
  ], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) throw new Error(`Preview extraction failed:\n${result.stderr}`);
}

async function main() {
  if (!fs.existsSync(narrationPath)) throw new Error('The new narration MP3 is missing.');
  const scenePaths = await buildScenes();
  await createContactSheet(scenePaths);
  renderVideo(scenePaths);
  extractPreview(3.2, 'verify-hook.png');
  extractPreview(14.2, 'verify-score.png');
  extractPreview(19.3, 'verify-comparison.png');
  extractPreview(32.1, 'verify-final.png');
  console.log(`Rendered ${outputPath}`);
  console.log(`Duration ${BOUNDARIES.at(-1).toFixed(3)} seconds across ${SCENES.length} original scenes.`);
  console.log(`Contact sheet ${contactSheetPath}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
