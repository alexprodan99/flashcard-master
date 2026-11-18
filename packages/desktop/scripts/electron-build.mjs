import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopRoot, '..', '..');
const require = createRequire(path.join(desktopRoot, 'package.json'));

function getReleaseDirs() {
  return [
    path.join(repoRoot, 'node_modules', 'better-sqlite3', 'build', 'Release'),
    path.join(desktopRoot, 'node_modules', 'better-sqlite3', 'build', 'Release'),
  ].filter((dir, index, all) => all.indexOf(dir) === index && fs.existsSync(dir));
}

function removeForgeMeta(releaseDirs) {
  for (const dir of releaseDirs) {
    const forgeMetaPath = path.join(dir, '.forge-meta');
    if (fs.existsSync(forgeMetaPath)) {
      fs.rmSync(forgeMetaPath, { force: true });
    }
  }
}

function canLoadHostBetterSqlite3() {
  const probe = spawnSync(
    process.execPath,
    ['-e', "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.close();"],
    { cwd: desktopRoot, stdio: 'ignore' },
  );
  return probe.status === 0;
}

function backupHostBinaries(releaseDirs) {
  if (!canLoadHostBetterSqlite3()) {
    return null;
  }
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-sqlite-host-'));
  const backups = [];
  releaseDirs.forEach((dir, index) => {
    const nodeBinary = path.join(dir, 'better_sqlite3.node');
    if (fs.existsSync(nodeBinary)) {
      const backupPath = path.join(backupDir, `better_sqlite3_${index}.node`);
      fs.copyFileSync(nodeBinary, backupPath);
      backups.push({ targetPath: nodeBinary, backupPath });
    }
  });
  return { backupDir, backups };
}

function restoreHostBinaries(backupState, releaseDirs) {
  try {
    if (backupState && backupState.backups.length > 0) {
      for (const { targetPath, backupPath } of backupState.backups) {
        if (fs.existsSync(backupPath)) {
          fs.copyFileSync(backupPath, targetPath);
        }
      }
      removeForgeMeta(releaseDirs);
      return;
    }

    // Fallback when host binary was already broken before packaging
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    spawnSync(npmCmd, ['rebuild', 'better-sqlite3'], {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    removeForgeMeta(releaseDirs);
  } finally {
    if (backupState?.backupDir) {
      fs.rmSync(backupState.backupDir, { recursive: true, force: true });
    }
  }
}

const releaseDirs = getReleaseDirs();
const backupState = backupHostBinaries(releaseDirs);

// Remove stale @electron/rebuild markers so electron-builder never reuses a host-Node ABI binary
removeForgeMeta(releaseDirs);

const electronBuilderMain = require.resolve('electron-builder');
const electronBuilderCli = path.resolve(path.dirname(electronBuilderMain), '..', 'cli.js');

let exitCode = 1;
try {
  const result = spawnSync(
    process.execPath,
    [electronBuilderCli, ...process.argv.slice(2)],
    {
      cwd: desktopRoot,
      stdio: 'inherit',
      env: process.env,
    },
  );
  exitCode = result.status ?? 1;
} finally {
  restoreHostBinaries(backupState, getReleaseDirs());
}

process.exit(exitCode);
