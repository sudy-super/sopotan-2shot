#!/usr/bin/env node

/**
 * Copies everything under `public/` into `dist/` so Cloudflare Pages can deploy
 * the generated static bundle. The script stays in pure Node.js to avoid any
 * external dependencies or platform-specific shell commands.
 */

const fs = require('fs');
const path = require('path');

const fsp = fs.promises;

const sourceDir = path.resolve(__dirname, '..', 'public');
const targetDir = path.resolve(__dirname, '..', 'dist');

async function removeDir(directory) {
  await fsp.rm(directory, { recursive: true, force: true });
}

async function copyRecursive(src, dest) {
  const stat = await fsp.stat(src);
  if (stat.isDirectory()) {
    await fsp.mkdir(dest, { recursive: true });
    const entries = await fsp.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const from = path.join(src, entry.name);
      const to = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await copyRecursive(from, to);
      } else if (entry.isSymbolicLink()) {
        const linkTarget = await fsp.readlink(from);
        await fsp.symlink(linkTarget, to);
      } else {
        await fsp.copyFile(from, to);
      }
    }
    return;
  }

  // Handles copying single file inputs (not expected, but keeps the helper robust).
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(src, dest);
}

async function main() {
  try {
    await removeDir(targetDir);
    await copyRecursive(sourceDir, targetDir);
    console.log(`Static build ready at ${targetDir}`);
  } catch (error) {
    console.error('Static build failed:', error);
    process.exitCode = 1;
  }
}

main();
