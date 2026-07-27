const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const staticDir = path.join(dist, 'static');
const serverDir = path.join(dist, 'server');

const rootFiles = [
  'about.html', 'ads.txt', 'app.js', 'blog.html', 'CNAME', 'deals.json',
  'alert-deals.json', 'enriched-deals.json', 'games-catalog.json', 'games.html', 'index.html',
  'feed.xml', 'login.html', 'login.js', 'manifest.json', 'methodology.html', 'privacy.html',
  'recommendations.css', 'recommendations.html', 'recommendations.js',
  'robots.txt', 'sitemap.xml', 'style.css', 'supabase-config.js', 'terms.html'
];
const publicDirectories = ['blog', 'config', 'deals', 'icons', 'lib', 'public'];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(staticDir, { recursive: true });
fs.mkdirSync(serverDir, { recursive: true });

for (const file of rootFiles) {
  const source = path.join(root, file);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(staticDir, file));
}

for (const directory of publicDirectories) {
  const source = path.join(root, directory);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(staticDir, directory), { recursive: true });
}

fs.writeFileSync(path.join(serverDir, 'index.js'), `export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  }
};
`);

const hostingConfig = path.join(root, '.openai', 'hosting.json');
if (fs.existsSync(hostingConfig)) {
  const outputDir = path.join(dist, '.openai');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(hostingConfig, path.join(outputDir, 'hosting.json'));
}

console.log(`Built ${rootFiles.length} root assets and ${publicDirectories.length} public directories.`);
