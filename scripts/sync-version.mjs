#!/usr/bin/env node

/**
 * Sync app version from git tag or commit hash.
 *
 * - If GITHUB_REF is a tag (refs/tags/vX.Y.Z) → use X.Y.Z
 * - If HEAD is tagged with vX.Y.Z → use X.Y.Z
 * - Otherwise → use 0.0.0-<short-hash>
 *
 * Updates package.json in place so electron-forge picks it up.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const pkgPath = resolve(root, 'package.json');

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

let version;

// Method 1: Check GITHUB_REF env var (most reliable in GitHub Actions)
const githubRef = process.env.GITHUB_REF || '';
if (githubRef.startsWith('refs/tags/v')) {
  version = githubRef.replace('refs/tags/v', '');
  console.log(`Version from GITHUB_REF: ${githubRef} → ${version}`);
}

// Method 2: Try git describe --tags --exact-match
if (!version) {
  const tag = run('git describe --tags --exact-match HEAD');
  if (tag && /^v?\d+\.\d+\.\d+/.test(tag)) {
    version = tag.replace(/^v/, '');
    console.log(`Version from git tag: ${tag} → ${version}`);
  }
}

// Method 3: Try git tag --points-at HEAD
if (!version) {
  const tags = run('git tag --points-at HEAD');
  if (tags) {
    const versionTag = tags.split('\n').find(t => /^v?\d+\.\d+\.\d+/.test(t.trim()));
    if (versionTag) {
      version = versionTag.trim().replace(/^v/, '');
      console.log(`Version from git tag --points-at: ${versionTag} → ${version}`);
    }
  }
}

// Fallback: use commit hash
if (!version) {
  const hash = run('git rev-parse --short HEAD') || 'unknown';
  version = `0.0.0-${hash}`;
  console.log(`Version from commit hash: ${hash} → ${version}`);
}

// Validate semver format
if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`Warning: version "${version}" doesn't look like semver`);
}

// Read and update package.json
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const oldVersion = pkg.version;
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`package.json version: ${oldVersion} → ${version}`);
