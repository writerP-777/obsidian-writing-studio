#!/usr/bin/env node
'use strict';

/**
 * Version bump script.
 * Usage: npm run bump -- X.X.X
 *
 * Updates manifest.json, versions.json, package.json, README.md,
 * SECURITY.md (minor/major bumps only), and CHANGELOG.md, then
 * prints the commands needed to commit and tag the release.
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function read(rel)         { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
function writeJson(rel, o) { fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(o, null, 2) + '\n'); }
function write(rel, text)  { fs.writeFileSync(path.join(ROOT, rel), text); }

// ── 1. Validate argument ──────────────────────────────────────────────────

const newVer = process.argv[2];
if (!newVer || !/^\d+\.\d+\.\d+$/.test(newVer)) {
  console.error('Error: version argument must be a valid semver string (e.g. 2.3.0).');
  console.error('Usage: npm run bump -- X.X.X');
  process.exit(1);
}

// ── 2. Read all source files up-front (fail before touching anything) ────

const manifest    = JSON.parse(read('manifest.json'));
const versions    = JSON.parse(read('versions.json'));
const pkg         = JSON.parse(read('package.json'));
const readme      = read('README.md');
const securityMd  = read('SECURITY.md');
const changelog   = read('CHANGELOG.md');

const prevVer = manifest.version;

if (newVer === prevVer) {
  console.error(`Already at version ${newVer}. Nothing to do.`);
  process.exit(1);
}

if (versions[newVer]) {
  console.error(`versions.json already contains an entry for ${newVer}. Aborting.`);
  process.exit(1);
}

if (changelog.includes(`## [${newVer}]`)) {
  console.error(`CHANGELOG.md already contains a [${newVer}] section. Aborting.`);
  process.exit(1);
}

const [newMaj, newMin] = newVer.split('.').map(Number);
const [prevMaj, prevMin] = prevVer.split('.').map(Number);
const minorOrMajorChanged = newMaj !== prevMaj || newMin !== prevMin;

// ── 3. Gather commits since the last tag ─────────────────────────────────

let prevTag = '';
try {
  prevTag = execSync('git tag --sort=-version:refname', { encoding: 'utf8' })
    .split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
} catch { /* no tags in repo */ }

let rawCommits = [];
if (prevTag) {
  try {
    rawCommits = execSync(`git log ${prevTag}..HEAD --format=%s`, { encoding: 'utf8' })
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .filter(s => !/^Merge (pull request|branch)/i.test(s))
      .filter(s => !/^(C|c)hore\(deps\):/i.test(s)); // skip Dependabot bumps
  } catch { /* empty range */ }
}

function stripPrefix(msg) {
  return msg.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, '').trim();
}

const added = [], fixed = [], changedItems = [], securityItems = [];

for (const msg of rawCommits) {
  const clean = stripPrefix(msg);
  if (/^feat(\([^)]*\))?!?:/i.test(msg)) {
    added.push(clean);
  } else if (/^fix(\([^)]*\))?!?:/i.test(msg)) {
    fixed.push(clean);
  } else if (/^security(\([^)]*\))?!?:/i.test(msg)) {
    securityItems.push(clean);
  } else {
    changedItems.push(clean);
  }
}

let changelogSection = `## [${newVer}]\n`;
if (added.length)         changelogSection += `\n### Added\n${added.map(c => `- ${c}`).join('\n')}\n`;
if (fixed.length)         changelogSection += `\n### Fixed\n${fixed.map(c => `- ${c}`).join('\n')}\n`;
if (changedItems.length)  changelogSection += `\n### Changed\n${changedItems.map(c => `- ${c}`).join('\n')}\n`;
if (securityItems.length) changelogSection += `\n### Security\n${securityItems.map(c => `- ${c}`).join('\n')}\n`;

if (!added.length && !fixed.length && !changedItems.length && !securityItems.length) {
  changelogSection += '\n_No changes recorded._\n';
}
changelogSection += '\n---\n';

// ── 4. Compute all new content (validate patterns before writing) ─────────

// README: replace **Version X.X.X** in-place
const newReadme = readme.replace(/\*\*Version \d+\.\d+\.\d+\*\*/, `**Version ${newVer}**`);
if (newReadme === readme) {
  console.error('README.md: pattern **Version X.X.X** not found. Aborting.');
  process.exit(1);
}

// SECURITY: replace supported version table rows
let newSecurityMd = securityMd;
if (minorOrMajorChanged) {
  const minorLine = `${newMaj}.${newMin}`;
  newSecurityMd = securityMd
    .replace(/\| \d+\.\d+\.x \(latest\) \| ✅ Yes \|/, `| ${minorLine}.x (latest) | ✅ Yes |`)
    .replace(/\| < \d+\.\d+ \| ❌ No \|/,              `| < ${minorLine} | ❌ No |`);
  if (newSecurityMd === securityMd) {
    console.error('SECURITY.md: supported version table rows not found. Aborting.');
    process.exit(1);
  }
}

// CHANGELOG: insert new section after the intro divider
const newChangelog = changelog.replace(
  /^(# Changelog[\s\S]*?---\n\n)/,
  `$1${changelogSection}\n`
);
if (newChangelog === changelog) {
  console.error('CHANGELOG.md: insertion point not found. Aborting.');
  process.exit(1);
}

// ── 5. Write all files atomically ─────────────────────────────────────────

writeJson('manifest.json', { ...manifest, version: newVer });
console.log(`✓ manifest.json   ${prevVer} → ${newVer}`);

writeJson('versions.json', { [newVer]: manifest.minAppVersion, ...versions });
console.log(`✓ versions.json   added "${newVer}": "${manifest.minAppVersion}"`);

writeJson('package.json', { ...pkg, version: newVer });
console.log(`✓ package.json    ${prevVer} → ${newVer}`);

write('README.md', newReadme);
console.log(`✓ README.md       Version ${newVer}`);

if (minorOrMajorChanged) {
  write('SECURITY.md', newSecurityMd);
  console.log(`✓ SECURITY.md     ${newMaj}.${newMin}.x supported`);
} else {
  console.log(`  SECURITY.md     skipped (patch-only bump)`);
}

write('CHANGELOG.md', newChangelog);
console.log(`✓ CHANGELOG.md    [${newVer}] section prepended`);

// ── 6. Print next steps ───────────────────────────────────────────────────

const secFile = minorOrMajorChanged ? ' SECURITY.md' : '';
console.log(`
Done. Review all changed files — especially CHANGELOG.md — then:

  git add manifest.json versions.json package.json README.md CHANGELOG.md${secFile}
  git commit -m "Bump version to ${newVer}"
  git tag ${newVer}
  git push && git push --tags
`);
