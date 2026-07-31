'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const outputDir = path.join(root, 'game-art-cinematic');

const GAMES = Object.freeze([
  ['mass-effect', '1328670'],
  ['monster-hunter', '582010'],
  ['lego-star-wars', '920210'],
  ['injustice-2', '627270'],
  ['borderlands-3', '397540'],
  ['detroit', '1222140'],
  ['psychonauts', '3830'],
  ['darkest-dungeon', '262060'],
  ['neon-white', '1533420'],
  ['quake', '2310'],
  ['dead-island-riptide', '383180'],
  ['dying-light', '239140'],
  ['control', '870780'],
  ['frostpunk', '323190'],
  ['before-your-eyes', '1082430']
]);

async function download(url, target) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'LootRadar/1.0 (thelootradar.com)' }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
}

async function prepareGame(key, appId) {
  const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=en&cc=us`;
  const detailsResponse = await fetch(detailsUrl, {
    headers: { 'user-agent': 'LootRadar/1.0 (thelootradar.com)' }
  });
  if (!detailsResponse.ok) throw new Error(`${detailsResponse.status} ${detailsResponse.statusText}: ${detailsUrl}`);
  const details = await detailsResponse.json();
  const data = details?.[appId]?.data;
  if (!data) throw new Error(`Steam returned no details for ${key} (${appId})`);

  const coverUrl = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`;
  const screenshotUrl = data.screenshots?.[0]?.path_full || data.header_image;
  if (!screenshotUrl) throw new Error(`Steam returned no screenshot for ${key} (${appId})`);

  await Promise.all([
    download(coverUrl, path.join(outputDir, `${key}-cover.jpg`)),
    download(screenshotUrl, path.join(outputDir, `${key}-shot.jpg`))
  ]);
  return { key, appId, name: data.name, screenshotUrl };
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const manifest = [];
  for (const [key, appId] of GAMES) {
    manifest.push(await prepareGame(key, appId));
    console.log(`Prepared ${key}`);
  }
  fs.writeFileSync(
    path.join(outputDir, 'manifest.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), games: manifest }, null, 2)}\n`
  );
  console.log(`Prepared ${manifest.length} games in ${outputDir}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
