'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  loadWeeklyIssues,
  renderGuideFeature,
  renderGuideHero,
  renderWeeklyGuide,
  weeklyGuideRelativePath
} = require('../lib/weekly-guide.js');

const root = path.resolve(__dirname, '..');
const checkOnly = process.argv.includes('--check');

function replaceBlock(source, start, end, replacement, label) {
  const expression = new RegExp(
    `${start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
  );
  if (!expression.test(source)) throw new Error(`Missing ${label} markers in blog.html.`);
  return source.replace(expression, replacement.trim());
}

function writeOrCheck(file, expected) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (current === expected) return false;
  if (checkOnly) {
    throw new Error(`${path.relative(root, file)} is out of date. Run npm run guides:build.`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, expected);
  return true;
}

function buildWeeklyGuides() {
  const issues = loadWeeklyIssues(root);
  if (!issues.length) throw new Error('No weekly guide issues were found.');
  let changed = 0;

  for (const issue of issues) {
    const output = path.join(root, weeklyGuideRelativePath(issue));
    if (writeOrCheck(output, renderWeeklyGuide(issue))) changed += 1;
  }

  const current = issues[issues.length - 1];
  const blogPath = path.join(root, 'blog.html');
  let blog = fs.readFileSync(blogPath, 'utf8');
  blog = replaceBlock(
    blog,
    '<!-- WEEKLY_GUIDE_HERO_START -->',
    '<!-- WEEKLY_GUIDE_HERO_END -->',
    renderGuideHero(current),
    'weekly guide hero'
  );
  blog = replaceBlock(
    blog,
    '<!-- WEEKLY_GUIDE_FEATURE_START -->',
    '<!-- WEEKLY_GUIDE_FEATURE_END -->',
    renderGuideFeature(current),
    'weekly guide feature'
  );
  if (writeOrCheck(blogPath, blog)) changed += 1;

  return { changed, count: issues.length, current };
}

if (require.main === module) {
  try {
    const result = buildWeeklyGuides();
    console.log(
      `${checkOnly ? 'Checked' : 'Built'} ${result.count} weekly guide issue(s); ` +
      `${result.changed} file(s) ${checkOnly ? 'need changes' : 'changed'}.`
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { buildWeeklyGuides, replaceBlock, writeOrCheck };
